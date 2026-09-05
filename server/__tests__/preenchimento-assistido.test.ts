import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { createApp as CreateApp } from '../app';

vi.mock('../portal-sessions', () => ({
  touchSession: vi.fn(),
  retomarSessao: vi.fn(),
  getCatalogo: vi.fn(),
  openSession: vi.fn(),
  closeSession: vi.fn(),
}));

vi.mock('../ai/openrouter', () => ({ chatCompletion: vi.fn() }));

vi.mock('../scrape/portal', () => ({
  listAulas: vi.fn(),
  listEstudantes: vi.fn(),
  postAulaContent: vi.fn(),
  prepararAulaParaPreenchimento: vi.fn(),
  PORTAL_URL: 'https://portal.example/teste',
}));

// A sessão headed abriria um navegador de verdade; o que interessa aqui é a
// rota entregar a ela o professor e o conteúdo certos.
vi.mock('../sessoes-headed', () => ({
  naSessaoHeaded: vi.fn(),
}));

const sessionId = 'sessao-1';
const turma = '9º ANO - 9º ANO B - MATUTINO';

const catalogo = {
  etapas: [{ nome: '1ª Etapa', turmas: [turma], meses: ['MARÇO'] }],
};

const originalDbPath = process.env.ESMERALDINHA_DB_PATH;
const originalKey = process.env.ESMERALDINHA_ENCRYPTION_KEY;
let tempDir: string;

function request(path: string, init?: RequestInit) {
  const base = 'http://localhost/api/cadernetas';
  return new Request(path === '/' ? base : `${base}${path}`, init);
}

function json(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** Um professor de verdade no banco: a rota decifra as credenciais dele. */
async function freshApp() {
  const { createApp } = await import('../app');
  const app = (createApp as typeof CreateApp)();

  const { createEncryptionPort } = await import('../encryption');
  const { getDb } = await import('../professores/db');
  const { createProfessor } = await import('../professores/store');

  const { id } = await createProfessor(getDb(), createEncryptionPort(), {
    nome: 'Maria',
    login: '111',
    senha: 'segredo',
    escola: 'Escola',
  });

  return { app, professorId: id };
}

async function cadastrarCaderneta(app: Awaited<ReturnType<typeof freshApp>>['app'], id: string) {
  const response = await app.fetch(
    request('/', json({ sessionId, professorId: id, turma })),
  );

  return (await response.json()) as { id: string };
}

const aula = {
  etapa: '1ª Etapa',
  mes: 'MARÇO',
  data: '05/03/2026',
  ordem: 1,
};

describe('preenchimento assistido de uma aula', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'esmeraldinha-assistido-'));
    process.env.ESMERALDINHA_DB_PATH = join(tempDir, 'esmeraldinha.db');
    process.env.ESMERALDINHA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

    vi.resetModules();
    vi.clearAllMocks();

    const { retomarSessao, getCatalogo } = await import(
      '../portal-sessions'
    );
    const sessao = {
      id: sessionId,
      professorId: '',
      login: '111',
      escola: 'Escola',
      page: {} as never,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };
    vi.mocked(retomarSessao).mockResolvedValue(sessao);
    vi.mocked(retomarSessao).mockResolvedValue(sessao);
    vi.mocked(getCatalogo).mockResolvedValue(catalogo);

    const { listAulas, listEstudantes } = await import('../scrape/portal');
    vi.mocked(listAulas).mockResolvedValue([]);
    vi.mocked(listEstudantes).mockResolvedValue([]);

    const { naSessaoHeaded } = await import('../sessoes-headed');
    vi.mocked(naSessaoHeaded).mockImplementation(
      async (_professorId, _credenciais, trabalho) => trabalho({} as never),
    );

    const { resetSincronizacoes } = await import('../cadernetas/sincronizacao');
    resetSincronizacoes();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.ESMERALDINHA_DB_PATH;
    else process.env.ESMERALDINHA_DB_PATH = originalDbPath;

    if (originalKey === undefined) delete process.env.ESMERALDINHA_ENCRYPTION_KEY;
    else process.env.ESMERALDINHA_ENCRYPTION_KEY = originalKey;

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('leva o conteúdo editado para a aula na sessão headed', async () => {
    const { app, professorId: id } = await freshApp();
    const caderneta = await cadastrarCaderneta(app, id);

    const response = await app.fetch(
      request(
        `/${caderneta.id}/aulas/preenchimentos-assistidos`,
        json({ ...aula, desenvolvimento: 'Roda de conversa.', isInteracao: 'Sim' }),
      ),
    );

    expect(response.status).toBe(200);

    const { naSessaoHeaded } = await import('../sessoes-headed');
    expect(naSessaoHeaded).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ login: '111', senha: 'segredo', escola: 'Escola' }),
      expect.any(Function),
    );

    const { prepararAulaParaPreenchimento } = await import('../scrape/portal');
    expect(prepararAulaParaPreenchimento).toHaveBeenCalledWith(expect.anything(), {
      etapa: '1ª Etapa',
      mes: 'MARÇO',
      turma,
      data: '05/03/2026',
      ordem: 1,
      conteudo: { desenvolvimento: 'Roda de conversa.', isInteracao: 'Sim' },
    });
  });

  it('não filtra por ordem quando a aula não tem uma', async () => {
    const { app, professorId: id } = await freshApp();
    const caderneta = await cadastrarCaderneta(app, id);

    await app.fetch(
      request(
        `/${caderneta.id}/aulas/preenchimentos-assistidos`,
        json({ ...aula, ordem: null }),
      ),
    );

    const { prepararAulaParaPreenchimento } = await import('../scrape/portal');
    expect(prepararAulaParaPreenchimento).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ ordem: expect.anything() }),
    );
  });

  it('nunca grava: a aula continua pendente na caderneta', async () => {
    const { app, professorId: id } = await freshApp();
    const caderneta = await cadastrarCaderneta(app, id);

    await app.fetch(
      request(
        `/${caderneta.id}/aulas/preenchimentos-assistidos`,
        json({ ...aula, desenvolvimento: 'Roda de conversa.' }),
      ),
    );

    const { postAulaContent } = await import('../scrape/portal');
    expect(postAulaContent).not.toHaveBeenCalled();
  });

  it('404 numa caderneta que não existe', async () => {
    const { app } = await freshApp();

    const response = await app.fetch(
      request('/nao-existe/aulas/preenchimentos-assistidos', json(aula)),
    );

    expect(response.status).toBe(404);
  });

  it('400 sem a etapa da aula', async () => {
    const { app, professorId: id } = await freshApp();
    const caderneta = await cadastrarCaderneta(app, id);

    const response = await app.fetch(
      request(
        `/${caderneta.id}/aulas/preenchimentos-assistidos`,
        json({ mes: 'MARÇO', data: '05/03/2026' }),
      ),
    );

    expect(response.status).toBe(400);
  });

  it('422 quando o portal não tem a aula', async () => {
    const { app, professorId: id } = await freshApp();
    const caderneta = await cadastrarCaderneta(app, id);

    const { MissingAulaRowsError } = await import('../scrape/errors');
    const { naSessaoHeaded } = await import('../sessoes-headed');
    vi.mocked(naSessaoHeaded).mockRejectedValue(
      new MissingAulaRowsError(['05/03/2026 (nenhuma linha)']),
    );

    const response = await app.fetch(
      request(`/${caderneta.id}/aulas/preenchimentos-assistidos`, json(aula)),
    );

    expect(response.status).toBe(422);
  });
});
