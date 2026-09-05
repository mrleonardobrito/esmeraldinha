import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { createApp as CreateApp } from '../app';

vi.mock('../portal-sessions', () => ({
  touchSession: vi.fn(),
  retomarSessao: vi.fn(),
  getCatalogo: vi.fn(),
  getCatalogoComAvaliacoes: vi.fn(),
  openSession: vi.fn(),
  closeSession: vi.fn(),
}));

vi.mock('../ai/openrouter', () => ({ chatCompletion: vi.fn() }));

vi.mock('../scrape/portal', () => ({
  listAulas: vi.fn(),
  listEstudantes: vi.fn(),
  postAulaContent: vi.fn(),
  // env.ts importa a URL padrão deste módulo.
  PORTAL_URL: 'https://portal.example/teste',
}));

const sessionId = 'sessao-1';
const professorId = 'prof-1';

const catalogo = {
  etapas: [
    {
      nome: '1ª Etapa',
      turmas: ['9º ANO - 9º ANO A - VESPERTINO', '9º ANO - 9º ANO B - MATUTINO'],
      meses: ['MARÇO'],
    },
    // A mesma turma em duas etapas não vira duas turmas.
    { nome: '2ª Etapa', turmas: ['9º ANO - 9º ANO A - VESPERTINO'], meses: ['JUNHO'] },
  ],
};

const originalEnv = {
  dbPath: process.env.ESMERALDINHA_DB_PATH,
  key: process.env.ESMERALDINHA_ENCRYPTION_KEY,
};
let tempDir: string;

async function freshApp() {
  const { createApp } = await import('../app');
  const app = (createApp as typeof CreateApp)();

  const { getDb } = await import('../professores/db');
  const { createProfessor } = await import('../professores/store');
  const { createEncryptionPort } = await import('../encryption');

  // Passa pelo store para a senha ficar cifrada como em produção: é dela que
  // a busca de turmas precisa para abrir a sessão.
  const professor = await createProfessor(getDb(), createEncryptionPort(), {
    nome: 'Maria',
    login: '11111111111',
    senha: 'segredo',
    escola: 'Escola',
  });

  getDb().prepare('UPDATE professores SET id = ? WHERE id = ?').run(professorId, professor.id);

  return app;
}

async function stubSession() {
  const { retomarSessao, getCatalogo, openSession, closeSession } = await import(
    '../portal-sessions'
  );
  const session = {
    id: sessionId,
    professorId,
    login: '11111111111',
    escola: 'Escola',
    page: {} as never,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };

  vi.mocked(retomarSessao).mockResolvedValue(session);
  vi.mocked(openSession).mockResolvedValue(session);
  vi.mocked(closeSession).mockResolvedValue(true);
  vi.mocked(getCatalogo).mockResolvedValue(catalogo);

  // O passo 2 lê os estudantes de cada turma na mesma sessão; sem estudantes
  // é o caso mais simples, e cada teste que se importa sobrescreve.
  const { listEstudantes } = await import('../scrape/portal');
  vi.mocked(listEstudantes).mockResolvedValue([]);
}

function request(path: string, init?: RequestInit) {
  // Sem barra sobrando: o Hono não casa `/api/turmas/` com a rota `/`.
  const base = 'http://localhost/api/turmas';
  return new Request(path.startsWith('/?') ? `${base}${path.slice(1)}` : `${base}${path}`, init);
}

function json(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

describe('rotas de turmas', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'esmeraldinha-turmas-'));
    process.env.ESMERALDINHA_DB_PATH = join(tempDir, 'esmeraldinha.db');
    process.env.ESMERALDINHA_ENCRYPTION_KEY = 'chave-de-teste';

    vi.resetModules();
    vi.clearAllMocks();

    await stubSession();
  });

  afterEach(async () => {
    const { closeDb } = await import('../professores/db');
    closeDb();

    if (originalEnv.dbPath === undefined) delete process.env.ESMERALDINHA_DB_PATH;
    else process.env.ESMERALDINHA_DB_PATH = originalEnv.dbPath;

    if (originalEnv.key === undefined) delete process.env.ESMERALDINHA_ENCRYPTION_KEY;
    else process.env.ESMERALDINHA_ENCRYPTION_KEY = originalEnv.key;

    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('passo 1: dados de login', () => {
    it('aceita credenciais que fazem login no portal', async () => {
      const app = await freshApp();

      const response = await app.fetch(
        request('/validacoes', json({ login: '111', senha: 'segredo', escola: 'Escola' })),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ valida: true, escola: 'Escola' });
    });

    it('fecha a sessão que abriu só para conferir', async () => {
      const app = await freshApp();
      const { closeSession } = await import('../portal-sessions');

      await app.fetch(
        request('/validacoes', json({ login: '111', senha: 'segredo', escola: 'Escola' })),
      );

      expect(vi.mocked(closeSession)).toHaveBeenCalledWith(sessionId);
    });

    it('recusa credenciais que o portal rejeita', async () => {
      const app = await freshApp();
      const { openSession } = await import('../portal-sessions');
      // Importado depois do `resetModules` para o `instanceof` da rota casar:
      // um import estático seria de outra instância do módulo.
      const { LoginError } = await import('../scrape/errors');
      vi.mocked(openSession).mockRejectedValue(new LoginError('Login não foi bem-sucedido.'));

      const response = await app.fetch(
        request('/validacoes', json({ login: '111', senha: 'errada', escola: 'Escola' })),
      );

      expect(response.status).toBe(401);
    });
  });

  describe('passo 2: buscar turmas', () => {
    it('guarda as turmas do portal com o turno lido do nome', async () => {
      const app = await freshApp();

      const response = await app.fetch(request('/buscas', json({ professorId })));
      const body = (await response.json()) as {
        turmas: { nome: string; turno: string | null }[];
      };

      expect(response.status).toBe(200);
      expect(body.turmas.map((turma) => [turma.nome, turma.turno])).toEqual([
        ['9º ANO - 9º ANO A - VESPERTINO', 'VESPERTINO'],
        ['9º ANO - 9º ANO B - MATUTINO', 'MATUTINO'],
      ]);
    });

    it('deixa as turmas guardadas para a listagem, sem ir ao portal de novo', async () => {
      const app = await freshApp();
      await app.fetch(request('/buscas', json({ professorId })));

      const response = await app.fetch(request(`/?professorId=${professorId}`));
      const body = (await response.json()) as { turmas: { nome: string }[] };

      expect(body.turmas).toHaveLength(2);
    });

    it('responde 404 quando o professor não existe', async () => {
      const app = await freshApp();

      const response = await app.fetch(
        request('/buscas', json({ professorId: 'prof-fantasma' })),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('passo 3: buscar estudantes', () => {
    it('guarda os estudantes que o portal devolveu', async () => {
      const app = await freshApp();
      const { listEstudantes } = await import('../scrape/portal');
      vi.mocked(listEstudantes).mockResolvedValue([
        {
          matricula: '12658',
          nome: 'Benjamin de Oliveira Silva',
          situacao: 'TRANSFERIDO',
          dataMatricula: '05/01/2026',
        },
      ]);

      const turmas = (await (
        await app.fetch(request('/buscas', json({ professorId })))
      ).json()) as { turmas: { id: string }[] };

      const response = await app.fetch(
        request(`/${turmas.turmas[0].id}/estudantes/buscas`, json({ sessionId })),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        estudantes: [
          {
            matricula: '12658',
            nome: 'Benjamin de Oliveira Silva',
            situacao: 'TRANSFERIDO',
            dataMatricula: '05/01/2026',
          },
        ],
      });
    });

    it('guarda a ausência de situação e data como nula', async () => {
      const app = await freshApp();
      const { listEstudantes } = await import('../scrape/portal');
      vi.mocked(listEstudantes).mockResolvedValue([
        { matricula: '12672', nome: 'Adylla Luiza Ferreira' },
      ]);

      const turmas = (await (
        await app.fetch(request('/buscas', json({ professorId })))
      ).json()) as { turmas: { id: string }[] };

      const response = await app.fetch(
        request(`/${turmas.turmas[0].id}/estudantes/buscas`, json({ sessionId })),
      );

      expect(await response.json()).toEqual({
        estudantes: [
          {
            matricula: '12672',
            nome: 'Adylla Luiza Ferreira',
            situacao: null,
            dataMatricula: null,
          },
        ],
      });
    });

    it('responde 404 quando a turma não existe', async () => {
      const app = await freshApp();

      const response = await app.fetch(
        request('/turma-fantasma/estudantes/buscas', json({ sessionId })),
      );

      expect(response.status).toBe(404);
    });
  });
});
