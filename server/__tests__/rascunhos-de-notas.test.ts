import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { createApp as CreateApp } from '../app';
import { autenticar, authDeTeste, type AppAutenticado } from './sessao-de-teste';

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
  PORTAL_URL: 'https://portal.example/teste',
}));

vi.mock('../ai/openrouter', () => ({ chatCompletion: vi.fn() }));

const professorId = 'prof-1';
const turma = '3º ANO - 3º ANO B - INTEGRAL';
let cadernetaId = '';

const originalDbPath = process.env.ESMERALDINHA_DB_PATH;
const originalKey = process.env.ESMERALDINHA_ENCRYPTION_KEY;
let tempDir: string;

/** A synced caderneta with two estudantes; I ETAPA has four avaliações, II ETAPA none. */
async function freshApp(): Promise<AppAutenticado> {
  const { createApp } = await import('../app');
  const app = (createApp as typeof CreateApp)({ auth: authDeTeste() });

  const { getDb } = await import('../professores/db');
  const { createEncryptionPort } = await import('../encryption');
  const { createCaderneta, syncCaderneta } = await import('../cadernetas/store');

  const db = getDb();
  db.prepare(
    `INSERT INTO professores (id, nome, login, senha_encrypted, escola, created_at)
     VALUES (?, 'Maria', '111', ?, 'Escola', '2026-01-01T00:00:00.000Z')`,
  ).run(professorId, await createEncryptionPort().encrypt('segredo'));

  cadernetaId = (await createCaderneta(db, { professorId, turma })).id;

  await syncCaderneta(db, cadernetaId, {
    estudantes: [
      { matricula: '13946', nome: 'ADYLLA GABRIELLA SILVA SANTOS', situacao: 'ATIVO', dataMatricula: null },
      { matricula: '13949', nome: 'ANA JULIA DA SILVA SOARES', situacao: 'ATIVO', dataMatricula: null },
    ],
    etapas: [
      {
        nome: 'I ETAPA',
        meses: ['Fevereiro'],
        aulas: [],
        boletins: [
          {
            disciplina: 'MATEMÁTICA - BNCC',
            avaliacoes: ['OBSERVAÇÃO', 'TRABALHO INDIVIDUAL', 'TRABALHO EM GRUPO', 'AVALIAÇÃO/PROVA'].map(
              (nome) => ({ nome, valor: 2.5 }),
            ),
            notas: [{ matricula: '13949', avaliacao: 'OBSERVAÇÃO', valor: 2 }],
            notasDoEstudante: [],
          },
        ],
      },
      { nome: 'II ETAPA', meses: ['Maio'], aulas: [] },
    ],
  });

  return autenticar(app);
}

function pedir(app: AppAutenticado, body: unknown, etapa = 'I ETAPA'): Promise<Response> {
  return app.fetch(
    new Request(
      `http://localhost/api/cadernetas/${cadernetaId}/etapas/${encodeURIComponent(etapa)}/boletim/rascunhos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
  );
}

const conversa = {
  mensagens: [{ papel: 'auxiliar', texto: 'A Ana Julia não alcançou a média.' }],
  estudantes: [{ matricula: '13946', notaFinal: 10, classificacao: 'Acima da média' }],
};

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'esmeraldinha-rascunhos-de-notas-'));
  process.env.ESMERALDINHA_DB_PATH = join(tempDir, 'esmeraldinha.db');
  process.env.ESMERALDINHA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

  vi.resetModules();
  vi.clearAllMocks();

  const { chatCompletion } = await import('../ai/openrouter');
  vi.mocked(chatCompletion).mockResolvedValue(
    JSON.stringify({
      resposta: 'Dei 5 à Ana Julia.',
      notas: [{ matricula: '13949', estudante: 'ANA JULIA', notaFinal: 5 }],
    }),
  );
});

afterEach(async () => {
  if (originalDbPath === undefined) delete process.env.ESMERALDINHA_DB_PATH;
  else process.env.ESMERALDINHA_DB_PATH = originalDbPath;
  if (originalKey === undefined) delete process.env.ESMERALDINHA_ENCRYPTION_KEY;
  else process.env.ESMERALDINHA_ENCRYPTION_KEY = originalKey;

  rmSync(tempDir, { recursive: true, force: true });
});

describe('POST /api/cadernetas/:id/etapas/:etapa/boletim/rascunhos', () => {
  it('returns the notas finais the agent decided, without touching the portal', async () => {
    const app = await freshApp();

    const response = await pedir(app, conversa);

    expect(response.status).toBe(200);
    (await expect(response.json())).resolves.toEqual({
      resposta: 'Dei 5 à Ana Julia.',
      notas: [{ matricula: '13949', notaFinal: 5 }],
      falhas: [],
    });

    const { prepararNotasParaPreenchimento } = await import('../scrape/portal');
    expect(prepararNotasParaPreenchimento).not.toHaveBeenCalled();
  });

  it('sends every estudante of the turma to the agent, with names from the database', async () => {
    const app = await freshApp();

    await pedir(app, conversa);

    const { chatCompletion } = await import('../ai/openrouter');
    const texto = vi
      .mocked(chatCompletion)
      .mock.calls[0][0].content.map((parte) => ('text' in parte ? parte.text : ''))
      .join('\n');
    expect(texto).toContain('- 13946 | ADYLLA GABRIELLA SILVA SANTOS | nota final atual: 10 | Acima da média');
    expect(texto).toContain('- 13949 | ANA JULIA DA SILVA SOARES | nota final atual: — | — | já lançada no portal');
  });

  it('refuses a request without a conversation', async () => {
    const app = await freshApp();

    const response = await pedir(app, { ...conversa, mensagens: [] });

    expect(response.status).toBe(400);
    (await expect(response.json())).resolves.toEqual({ error: 'Informe a conversa com o agente.' });
  });

  it('refuses an etapa with no avaliação', async () => {
    const app = await freshApp();

    const response = await pedir(app, conversa, 'II ETAPA');

    expect(response.status).toBe(422);
    (await expect(response.json())).resolves.toEqual({
      error: 'Esta etapa não tem avaliação cadastrada nesta disciplina.',
    });
  });

  it('reports the agent failing', async () => {
    const { chatCompletion } = await import('../ai/openrouter');
    const { OpenRouterError } = await import('../ai/errors');
    vi.mocked(chatCompletion).mockRejectedValue(new OpenRouterError(500, 'x'));
    const app = await freshApp();

    const response = await pedir(app, conversa);

    expect(response.status).toBe(502);
  });
});
