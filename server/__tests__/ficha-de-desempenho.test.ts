import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { createApp as CreateApp } from '../app';
import { autenticar } from './sessao-de-teste';

vi.mock('../portal-sessions', () => ({
  touchSession: vi.fn(),
  retomarSessao: vi.fn(),
  getCatalogo: vi.fn(),
  openSession: vi.fn(),
  closeSession: vi.fn(),
  donoDaSessao: vi.fn(),
}));

vi.mock('../ai/openrouter', () => ({ chatCompletion: vi.fn() }));

vi.mock('../scrape/ficha-de-desempenho', () => ({ lerEstruturaDaFicha: vi.fn() }));

vi.mock('../sessoes-headed', () => ({ naSessaoHeaded: vi.fn() }));

vi.mock('../fichas/preenchimento-assistido', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../fichas/preenchimento-assistido')>()),
  acompanharPreenchimento: vi.fn(),
}));

const turma = 'CRECHE II - CRECHE II - VESPERTINO';
const estrutura = {
  ficha: 'FICHA DESCRITIVA EDUCAÇÃO INFANTIL - CRECHE II - Todas disciplinas',
  areas: [
    { indice: 0, titulo: 'O EU, O OUTRO E NÓS (EO)', habilidades: [{ indice: 0, numero: '1°', texto: 'Demonstra cuidado.' }] },
    { indice: 1, titulo: 'CORPO, GESTOS E MOVIMENTOS (CG)', habilidades: [{ indice: 0, numero: '1°', texto: 'Explora.' }] },
  ],
};

const originalDbPath = process.env.ESMERALDINHA_DB_PATH;
const originalKey = process.env.ESMERALDINHA_ENCRYPTION_KEY;
let tempDir: string;

function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost/api/cadernetas${path}`, init);
}

function json(body: unknown, method = 'POST'): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function freshApp() {
  const { createApp } = await import('../app');
  const app = (createApp as typeof CreateApp)();
  const { createEncryptionPort } = await import('../encryption');
  const { getDb } = await import('../professores/db');
  const { createProfessor } = await import('../professores/store');
  const { createCaderneta, syncCaderneta } = await import('../cadernetas/store');

  const { id: professorId } = await createProfessor(getDb(), createEncryptionPort(), {
    nome: 'Maria', login: '111', senha: 'segredo', escola: 'Escola',
  });
  const caderneta = createCaderneta(getDb(), { professorId, turma });
  syncCaderneta(getDb(), caderneta.id, {
    etapas: [{ nome: 'I ETAPA', meses: ['MARÇO'], aulas: [] }],
    estudantes: [
      { matricula: '10315', nome: 'ANA RUTHE IZABELLY DA SILVA', situacao: 'ATIVO', dataMatricula: null },
      { matricula: '10316', nome: 'JOÃO PEDRO SANTOS', situacao: 'TRANSFERIDO', dataMatricula: null },
    ],
  });

  return { app: await autenticar(app), professorId, cadernetaId: caderneta.id };
}

describe('ficha de desempenho routes', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'esmeraldinha-ficha-'));
    process.env.ESMERALDINHA_DB_PATH = join(tempDir, 'esmeraldinha.db');
    process.env.ESMERALDINHA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    vi.resetModules();
    vi.clearAllMocks();

    const { openSession } = await import('../portal-sessions');
    vi.mocked(openSession).mockResolvedValue({ id: 'leitura-1', page: {} } as never);
    const { lerEstruturaDaFicha } = await import('../scrape/ficha-de-desempenho');
    vi.mocked(lerEstruturaDaFicha).mockResolvedValue(estrutura);
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.ESMERALDINHA_DB_PATH;
    else process.env.ESMERALDINHA_DB_PATH = originalDbPath;
    if (originalKey === undefined) delete process.env.ESMERALDINHA_ENCRYPTION_KEY;
    else process.env.ESMERALDINHA_ENCRYPTION_KEY = originalKey;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reads the structure from the portal once and serves it from the cache', async () => {
    const { app, cadernetaId } = await freshApp();

    const antes = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/estrutura`));
    expect(await antes.json()).toEqual({ estrutura: null });

    const leitura = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/estrutura/leituras`, { method: 'POST' }));
    expect(leitura.status).toBe(200);
    expect((await leitura.json()).estrutura).toMatchObject(estrutura);

    const { closeSession } = await import('../portal-sessions');
    expect(closeSession).toHaveBeenCalledWith('leitura-1');

    const depois = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/estrutura`));
    expect((await depois.json()).estrutura).toMatchObject(estrutura);
  });

  it('refuses observações before the structure was read', async () => {
    const { app, cadernetaId } = await freshApp();
    const form = new FormData();
    form.append('areas', JSON.stringify([0]));
    form.append('texto', 'Ana não dialoga.');

    const response = await app.fetch(request(`/${cadernetaId}/etapas/I%20ETAPA/ficha-de-desempenho/observacoes`, { method: 'POST', body: form }));

    expect(response.status).toBe(422);
  });

  it('previews the agent’s exceções with the turma’s estudantes', async () => {
    const { app, cadernetaId } = await freshApp();
    await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/estrutura/leituras`, { method: 'POST' }));
    const { chatCompletion } = await import('../ai/openrouter');
    vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify({
      resposta: 'ok',
      estudantes: [{ estudante: 'Ana Ruthe', matricula: '', excecoes: [{ area: 0, habilidade: 0, conceito: 'RD', trecho: 'Ana' }] }],
      gerais: [],
    }));
    const form = new FormData();
    form.append('areas', JSON.stringify([0]));
    form.append('texto', 'Ana tem dificuldade em cuidar dos colegas.');

    const response = await app.fetch(request(`/${cadernetaId}/etapas/I%20ETAPA/ficha-de-desempenho/observacoes`, { method: 'POST', body: form }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.estudantes).toEqual([{ matricula: '10315', nome: 'ANA RUTHE IZABELLY DA SILVA', excecoes: [{ area: 0, habilidade: 0, conceito: 'RD', trecho: 'Ana' }] }]);
    expect(body.turma.map((e: { matricula: string }) => e.matricula)).toEqual(['10315', '10316']);
  });

  it('starts the assisted run in the headed window and reports its state', async () => {
    const { app, cadernetaId, professorId } = await freshApp();
    await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/estrutura/leituras`, { method: 'POST' }));
    const { naSessaoHeaded } = await import('../sessoes-headed');
    vi.mocked(naSessaoHeaded).mockImplementation(async (_id, _cred, trabalho) => trabalho({} as never));
    const { acompanharPreenchimento } = await import('../fichas/preenchimento-assistido');
    vi.mocked(acompanharPreenchimento).mockImplementation((_page, _plano, onEstado) => {
      onEstado({ status: 'aguardando-auxiliar', etapa: 'I ETAPA', total: 1, atual: { matricula: '10315', nome: 'ANA' }, preenchidos: [], pulados: [], erro: null });
      return new Promise(() => {});
    });

    const inicio = await app.fetch(request(
      `/${cadernetaId}/etapas/I%20ETAPA/ficha-de-desempenho/preenchimentos-assistidos`,
      json({ areas: [0], excecoes: [{ matricula: '10315', area: 0, habilidade: 0, conceito: 'RD' }] }),
    ));

    expect(inicio.status).toBe(202);
    expect(naSessaoHeaded).toHaveBeenCalledWith(professorId, expect.objectContaining({ login: '111' }), expect.any(Function));
    const plano = vi.mocked(acompanharPreenchimento).mock.calls[0][1];
    expect(plano).toMatchObject({ turma, etapa: 1, nomeDaEtapa: 'I ETAPA', areas: [0] });
    expect(plano.excecoes.get('10315')).toEqual([{ area: 0, habilidade: 0, conceito: 'RD' }]);

    const estado = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/preenchimentos-assistidos/atual`));
    expect((await estado.json()).estado).toMatchObject({ status: 'aguardando-auxiliar', atual: { matricula: '10315' } });

    const outro = await app.fetch(request(
      `/${cadernetaId}/etapas/I%20ETAPA/ficha-de-desempenho/preenchimentos-assistidos`,
      json({ areas: [0], excecoes: [] }),
    ));
    expect(outro.status).toBe(409);
  });

  it('refuses exceções for estudantes outside the turma', async () => {
    const { app, cadernetaId } = await freshApp();
    await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/estrutura/leituras`, { method: 'POST' }));

    const response = await app.fetch(request(
      `/${cadernetaId}/etapas/I%20ETAPA/ficha-de-desempenho/preenchimentos-assistidos`,
      json({ areas: [0], excecoes: [{ matricula: '99999', area: 0, habilidade: 0, conceito: 'RD' }] }),
    ));

    expect(response.status).toBe(422);
  });

  it('rejects an etapa the ficha does not have', async () => {
    const { app, cadernetaId } = await freshApp();
    await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/estrutura/leituras`, { method: 'POST' }));
    const form = new FormData();
    form.append('areas', JSON.stringify([0]));
    form.append('texto', 'x');

    const response = await app.fetch(request(`/${cadernetaId}/etapas/1%C2%AA%20Etapa/ficha-de-desempenho/observacoes`, { method: 'POST', body: form }));

    expect(response.status).toBe(422);
  });
});
