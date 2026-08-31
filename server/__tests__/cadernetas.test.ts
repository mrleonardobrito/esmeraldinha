import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { createApp as CreateApp } from '../app';

const originalEnv = {
  dbPath: process.env.ESMERALDINHA_DB_PATH,
  adapter: process.env.ENCRYPTION_ADAPTER,
  key: process.env.ESMERALDINHA_ENCRYPTION_KEY,
};

let tempDir: string;
let dbPath: string;

const openSessionMock = vi.fn();

// Stubs the portal itself: this ticket resolves credenciais do professor,
// it does not drive a real browser, so Playwright must never launch here.
vi.mock('../portal-sessions', () => ({
  openSession: (...args: unknown[]) => openSessionMock(...args),
  closeSession: vi.fn(),
  touchSession: vi.fn(),
}));

async function freshApp() {
  const { createApp } = await import('../app');
  return (createApp as typeof CreateApp)();
}

function novoProfessor(overrides: Partial<Record<string, string>> = {}) {
  return {
    nome: 'Maria da Silva',
    login: '111.444.777-35',
    senha: 'senha-secreta',
    escola: 'Escola Municipal',
    ...overrides,
  };
}

describe('POST /api/cadernetas/sessoes', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'esmeraldinha-cadernetas-'));
    dbPath = join(tempDir, 'esmeraldinha.db');

    process.env.ESMERALDINHA_DB_PATH = dbPath;
    process.env.ENCRYPTION_ADAPTER = 'dev';
    process.env.ESMERALDINHA_ENCRYPTION_KEY = 'chave-de-teste';

    openSessionMock.mockReset();

    vi.resetModules();
  });

  afterEach(async () => {
    process.env.ESMERALDINHA_DB_PATH = originalEnv.dbPath;
    process.env.ENCRYPTION_ADAPTER = originalEnv.adapter;
    process.env.ESMERALDINHA_ENCRYPTION_KEY = originalEnv.key;

    vi.resetModules();

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves the professor id into decrypted credenciais and opens a sessão', async () => {
    const app = await freshApp();

    const createResponse = await app.fetch(
      new Request('http://localhost/api/professores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor()),
      }),
    );
    const professor = await createResponse.json();

    openSessionMock.mockResolvedValue({
      id: 'sessao-1',
      login: '11144477735',
      escola: 'Escola Municipal',
      createdAt: Date.now(),
    });

    const response = await app.fetch(
      new Request('http://localhost/api/cadernetas/sessoes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ professorId: professor.id }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ sessionId: 'sessao-1', escola: 'Escola Municipal' });

    expect(openSessionMock).toHaveBeenCalledTimes(1);
    expect(openSessionMock).toHaveBeenCalledWith({
      login: '11144477735',
      senha: 'senha-secreta',
      escola: 'Escola Municipal',
    });
  });

  it('gives a 404 for an unknown professor, without ever calling the portal', async () => {
    const app = await freshApp();

    const response = await app.fetch(
      new Request('http://localhost/api/cadernetas/sessoes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ professorId: 'professor-inexistente' }),
      }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBeTruthy();
    expect(openSessionMock).not.toHaveBeenCalled();
  });

  it('rejects a request without a professorId', async () => {
    const app = await freshApp();

    const response = await app.fetch(
      new Request('http://localhost/api/cadernetas/sessoes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    expect(openSessionMock).not.toHaveBeenCalled();
  });

  it('still surfaces a portal rejection as a clear 401, distinct from an unknown professor', async () => {
    const app = await freshApp();

    const createResponse = await app.fetch(
      new Request('http://localhost/api/professores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor()),
      }),
    );
    const professor = await createResponse.json();

    const { LoginError } = await import('../scrape/errors');
    openSessionMock.mockRejectedValue(new LoginError('Usuário ou senha inválidos.'));

    const response = await app.fetch(
      new Request('http://localhost/api/cadernetas/sessoes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ professorId: professor.id }),
      }),
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Usuário ou senha inválidos.');
  });
});
