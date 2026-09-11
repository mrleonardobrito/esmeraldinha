import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { createApp as CreateApp } from '../app';
import { autenticar, type AppAutenticado } from './sessao-de-teste';

vi.mock('../portal-sessions', () => ({
  touchSession: vi.fn(),
  retomarSessao: vi.fn(),
  getCatalogo: vi.fn(),
  openSession: vi.fn(),
  closeSession: vi.fn(),
}));

vi.mock('../scrape/portal', () => ({
  prepararAulaParaPreenchimento: vi.fn(),
  prepararNotasParaPreenchimento: vi.fn(),
  // env.ts importa a URL padrão deste módulo.
  PORTAL_URL: 'https://portal.example/teste',
}));

vi.mock('../ai/openrouter', () => ({ chatCompletion: vi.fn() }));

const professorId = 'prof-1';
let cadernetaId = '';
const turma = '3º ANO - 3º ANO A - INTEGRAL';

const originalDbPath = process.env.ESMERALDINHA_DB_PATH;
const originalKey = process.env.ESMERALDINHA_ENCRYPTION_KEY;
const originalCsv = process.env.CODIGOS_CR_CSV;
let tempDir: string;

/**
 * Uma caderneta já sincronizada: duas etapas, uma aula preenchida e duas
 * pendentes em Setembro, e uma aula de Agosto para servir de referência.
 */
async function freshApp({ comCatalogo = true } = {}): Promise<AppAutenticado> {
  const { createApp } = await import('../app');
  const app = (createApp as typeof CreateApp)();

  const { getDb } = await import('../professores/db');
  const { createEncryptionPort } = await import('../encryption');
  const { createCaderneta, syncCaderneta } = await import('../cadernetas/store');
  const { replaceCodigosCR } = await import('../codigos-cr/store');

  const db = getDb();
  db.prepare(
    `INSERT INTO professores (id, nome, login, senha_encrypted, escola, created_at)
     VALUES (?, 'Maria', '111', ?, 'Escola', '2026-01-01T00:00:00.000Z')`,
  ).run(professorId, await createEncryptionPort().encrypt('segredo'));

  cadernetaId = createCaderneta(db, { professorId, turma }).id;

  syncCaderneta(db, cadernetaId, {
    estudantes: [],
    etapas: [
      {
        nome: 'III ETAPA',
        meses: ['Agosto', 'Setembro'],
        aulas: [
          {
            mes: 'Agosto',
            data: '26/08/2026',
            ordem: 1,
            preenchida: true,
            codigoCR: 'EF03LP25',
            desenvolvimento: 'Reescrita de fábula.',
            ferramentas: 'Caderno',
          },
          {
            mes: 'Setembro',
            data: '09/09/2026',
            ordem: 1,
            preenchida: true,
            codigoCR: 'EF03LP18',
            desenvolvimento: 'Reescrita coletiva do final da fábula.',
            ferramentas: 'Caderno, quadro',
          },
          { mes: 'Setembro', data: '16/09/2026', ordem: 1, preenchida: false },
          { mes: 'Setembro', data: '23/09/2026', ordem: 1, preenchida: false },
        ],
      },
    ],
  });

  if (comCatalogo) {
    replaceCodigosCR(db, [{ codigo: 'EF03LP18', texto: 'Ler e compreender fábulas.' }]);
  }

  return autenticar(app);
}

function pedir(app: AppAutenticado, form: FormData, etapa = 'III ETAPA'): Promise<Response> {
  return app.fetch(
    new Request(
      `http://localhost/api/cadernetas/${cadernetaId}/etapas/${encodeURIComponent(etapa)}/conteudos/rascunhos`,
      { method: 'POST', body: form },
    ),
  );
}

function conversa(texto: string, extras: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.append('mes', 'Setembro');
  form.append('mensagens', JSON.stringify([{ papel: 'auxiliar', texto }]));
  for (const [chave, valor] of Object.entries(extras)) form.append(chave, valor);
  return form;
}

const respostaDoAgente = {
  resposta: 'Escrevi as duas aulas.',
  aulas: [
    { data: '16/09/2026', ordem: 1, codigoCR: 'EF03LP18', desenvolvimento: 'Retomada.', ferramentas: 'Livro' },
    { data: '23/09/2026', ordem: 1, codigoCR: '', desenvolvimento: 'Produção.', ferramentas: 'Caderno' },
  ],
};

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'esmeraldinha-rascunhos-'));
  process.env.ESMERALDINHA_DB_PATH = join(tempDir, 'esmeraldinha.db');
  process.env.ESMERALDINHA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.CODIGOS_CR_CSV = join(tempDir, 'habilidades.csv');
  writeFileSync(
    process.env.CODIGOS_CR_CSV,
    'codigo,componente,texto\nEF03LP18,ef-comp-lp,Ler e compreender fábulas (da planilha).\n',
  );

  vi.resetModules();
  vi.clearAllMocks();

  const { chatCompletion } = await import('../ai/openrouter');
  vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify(respostaDoAgente));
});

afterEach(() => {
  if (originalDbPath === undefined) delete process.env.ESMERALDINHA_DB_PATH;
  else process.env.ESMERALDINHA_DB_PATH = originalDbPath;
  if (originalKey === undefined) delete process.env.ESMERALDINHA_ENCRYPTION_KEY;
  else process.env.ESMERALDINHA_ENCRYPTION_KEY = originalKey;
  if (originalCsv === undefined) delete process.env.CODIGOS_CR_CSV;
  else process.env.CODIGOS_CR_CSV = originalCsv;

  rmSync(tempDir, { recursive: true, force: true });
});

describe('POST /api/cadernetas/:id/etapas/:etapa/conteudos/rascunhos', () => {
  it('devolve um rascunho por aula pendente do mês, sem tocar no portal', async () => {
    const app = await freshApp();

    const response = await pedir(app, conversa('Fechamos fábulas.'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      resposta: 'Escrevi as duas aulas.',
      aulas: [
        {
          data: '16/09/2026',
          ordem: 1,
          codigoCR: '1. (EF03LP18) Ler e compreender fábulas.',
          desenvolvimento: 'Retomada.',
          ferramentas: 'Livro',
        },
        { data: '23/09/2026', ordem: 1, codigoCR: '', desenvolvimento: 'Produção.', ferramentas: 'Caderno' },
      ],
    });

    const { prepararAulaParaPreenchimento } = await import('../scrape/portal');
    expect(prepararAulaParaPreenchimento).not.toHaveBeenCalled();
  });

  it('leva ao agente as aulas já preenchidas do escopo e as referências escolhidas', async () => {
    const app = await freshApp();

    await pedir(
      app,
      conversa('Continue.', {
        referencias: JSON.stringify([{ etapa: 'III ETAPA', data: '26/08/2026', ordem: 1 }]),
      }),
    );

    const { chatCompletion } = await import('../ai/openrouter');
    const { system } = vi.mocked(chatCompletion).mock.calls[0][0];
    expect(system).toContain('Reescrita coletiva do final da fábula.');
    expect(system).toContain('Reescrita de fábula.');
    expect(system).toContain('16/09/2026 (ordem 1)');
    expect(system).not.toContain('26/08/2026 (ordem 1)\n-');
  });

  it('importa o catálogo de códigos CR da planilha quando o banco ainda não o tem', async () => {
    const app = await freshApp({ comCatalogo: false });

    const response = await pedir(app, conversa('Fechamos fábulas.'));

    expect(response.status).toBe(200);
    const { aulas } = (await response.json()) as { aulas: { codigoCR: string }[] };
    expect(aulas[0].codigoCR).toBe('1. (EF03LP18) Ler e compreender fábulas (da planilha).');

    const { getDb } = await import('../professores/db');
    const { listCodigosCR } = await import('../codigos-cr/store');
    expect(listCodigosCR(getDb())).toHaveLength(1);
  });

  it('devolve 400 sem a conversa', async () => {
    const app = await freshApp();
    const form = new FormData();
    form.append('mes', 'Setembro');

    const response = await pedir(app, form);

    expect(response.status).toBe(400);
  });

  it('devolve 422 quando o escopo não tem aulas', async () => {
    const app = await freshApp();
    const form = conversa('Oi');
    form.set('mes', 'Outubro');

    const response = await pedir(app, form);

    expect(response.status).toBe(422);
  });

  it('devolve 404 para uma caderneta que não existe', async () => {
    const app = await freshApp();

    const response = await app.fetch(
      new Request('http://localhost/api/cadernetas/nada/etapas/x/conteudos/rascunhos', {
        method: 'POST',
        body: conversa('Oi'),
      }),
    );

    expect(response.status).toBe(404);
  });

  it('devolve 503 quando a chave do agente não está configurada', async () => {
    const app = await freshApp();
    const { chatCompletion } = await import('../ai/openrouter');
    const { OpenRouterNotConfiguredError } = await import('../ai/errors');
    vi.mocked(chatCompletion).mockRejectedValue(new OpenRouterNotConfiguredError());

    const response = await pedir(app, conversa('Oi'));

    expect(response.status).toBe(503);
  });
});
