import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginError } from '../scrape/errors';

/**
 * O navegador é falso, mas cada contexto devolve uma página nova — é assim que
 * o teste distingue a página da sessão original da página da sessão retomada.
 */
const paginas: { id: number; fechada: boolean }[] = [];

function novaPagina() {
  const pagina = {
    id: paginas.length + 1,
    fechada: false,
    isClosed: () => pagina.fechada,
  };
  paginas.push(pagina);
  return pagina;
}

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newContext: vi.fn(async () => {
        const pagina = novaPagina();
        return {
          newPage: vi.fn(async () => pagina),
          close: vi.fn(async () => {
            pagina.fechada = true;
          }),
        };
      }),
      close: vi.fn(async () => {}),
    })),
  },
}));

vi.mock('../scrape/portal', () => ({
  login: vi.fn(async () => {}),
  listConteudoOptions: vi.fn(async () => ({ etapas: [] })),
  PORTAL_URL: 'https://portal.example/teste',
}));

const originalDbPath = process.env.ESMERALDINHA_DB_PATH;
const originalAdapter = process.env.ENCRYPTION_ADAPTER;
const originalKey = process.env.ESMERALDINHA_ENCRYPTION_KEY;
let tempDir: string;

const professorId = 'prof-1';

async function comProfessor() {
  const { getDb } = await import('../professores/db');
  const { createProfessor } = await import('../professores/store');
  const { createEncryptionPort } = await import('../encryption');

  const professor = await createProfessor(getDb(), createEncryptionPort(), {
    nome: 'Maria',
    login: '11111111111',
    senha: 'segredo',
    escola: 'Escola',
  });

  getDb().prepare('UPDATE professores SET id = ? WHERE id = ?').run(professorId, professor.id);
}

beforeEach(() => {
  paginas.length = 0;
  tempDir = mkdtempSync(join(tmpdir(), 'esmeraldinha-sessoes-'));
  process.env.ESMERALDINHA_DB_PATH = join(tempDir, 'teste.db');
  process.env.ENCRYPTION_ADAPTER = 'dev';
  process.env.ESMERALDINHA_ENCRYPTION_KEY = 'chave-de-teste';
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(async () => {
  const { closeDb } = await import('../professores/db');
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
  process.env.ESMERALDINHA_DB_PATH = originalDbPath;
  process.env.ENCRYPTION_ADAPTER = originalAdapter;
  process.env.ESMERALDINHA_ENCRYPTION_KEY = originalKey;
});

describe('retomarSessao', () => {
  it('devolve a mesma sessão enquanto ela está viva, sem refazer o login', async () => {
    await comProfessor();
    const { openSession, retomarSessao } = await import('../portal-sessions');
    const { login } = await import('../scrape/portal');

    const aberta = await openSession(
      { login: '11111111111', senha: 'segredo', escola: 'Escola' },
      { professorId },
    );

    const retomada = await retomarSessao(aberta.id);

    expect(retomada?.id).toBe(aberta.id);
    expect(retomada?.page).toBe(aberta.page);
    expect(vi.mocked(login)).toHaveBeenCalledTimes(1);
  });

  it('refaz o login com as credenciais do professor quando a sessão expirou', async () => {
    await comProfessor();
    const { openSession, retomarSessao } = await import('../portal-sessions');
    const { login } = await import('../scrape/portal');

    const aberta = await openSession(
      { login: '11111111111', senha: 'segredo', escola: 'Escola' },
      { professorId },
    );

    // O que a ociosidade faz: a sessão sai do mapa sem que a tela saiba.
    await expirar(aberta.id);

    const retomada = await retomarSessao(aberta.id);

    // Mesmo id, página nova: a tela continua com o `sessionId` que tinha.
    expect(retomada?.id).toBe(aberta.id);
    expect(retomada?.page).not.toBe(aberta.page);
    expect(vi.mocked(login)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(login).mock.calls[1][1]).toMatchObject({
      login: '11111111111',
      senha: 'segredo',
    });
  });

  it('faz um login só quando dois pedidos chegam juntos numa sessão expirada', async () => {
    await comProfessor();
    const { openSession, retomarSessao } = await import('../portal-sessions');
    const { login } = await import('../scrape/portal');

    const aberta = await openSession(
      { login: '11111111111', senha: 'segredo', escola: 'Escola' },
      { professorId },
    );
    await expirar(aberta.id);

    const [uma, outra] = await Promise.all([
      retomarSessao(aberta.id),
      retomarSessao(aberta.id),
    ]);

    expect(uma?.page).toBe(outra?.page);
    expect(vi.mocked(login)).toHaveBeenCalledTimes(2);
  });

  it('não retoma uma sessão encerrada de propósito', async () => {
    await comProfessor();
    const { openSession, closeSession, retomarSessao } = await import('../portal-sessions');

    const aberta = await openSession(
      { login: '11111111111', senha: 'segredo', escola: 'Escola' },
      { professorId },
    );

    await closeSession(aberta.id);

    expect(await retomarSessao(aberta.id)).toBeUndefined();
  });

  it('não retoma uma sessão de professor que saiu do cadastro', async () => {
    await comProfessor();
    const { openSession, retomarSessao } = await import('../portal-sessions');
    const { getDb } = await import('../professores/db');

    const aberta = await openSession(
      { login: '11111111111', senha: 'segredo', escola: 'Escola' },
      { professorId },
    );
    await expirar(aberta.id);

    getDb().prepare('DELETE FROM professores WHERE id = ?').run(professorId);

    expect(await retomarSessao(aberta.id)).toBeUndefined();
  });

  it('propaga a recusa do portal, para a tela avisar que a senha não serve mais', async () => {
    await comProfessor();
    const { openSession, retomarSessao } = await import('../portal-sessions');
    const { login } = await import('../scrape/portal');

    const aberta = await openSession(
      { login: '11111111111', senha: 'segredo', escola: 'Escola' },
      { professorId },
    );
    await expirar(aberta.id);

    vi.mocked(login).mockRejectedValueOnce(new LoginError('Login ou senha inválidos.'));

    await expect(retomarSessao(aberta.id)).rejects.toBeInstanceOf(LoginError);
  });

  it('raspa o catálogo de novo na página da sessão retomada', async () => {
    await comProfessor();
    const { openSession, getCatalogo } = await import('../portal-sessions');
    const { listConteudoOptions } = await import('../scrape/portal');

    const aberta = await openSession(
      { login: '11111111111', senha: 'segredo', escola: 'Escola' },
      { professorId },
    );

    await getCatalogo(aberta.id);
    await expirar(aberta.id);

    expect(await getCatalogo(aberta.id)).toEqual({ etapas: [] });
    // O catálogo mora na página; a página nova precisa do seu.
    expect(vi.mocked(listConteudoOptions)).toHaveBeenCalledTimes(2);
  });
});

/** O que o timer de ociosidade faz, sem esperar os quinze minutos. */
async function expirar(id: string): Promise<void> {
  const { expirarSessaoParaTeste } = await import('../portal-sessions');
  expirarSessaoParaTeste(id);
}
