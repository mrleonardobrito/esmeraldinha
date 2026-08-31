import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { createApp as CreateApp } from '../../app';

const originalEnv = {
  dbPath: process.env.ESMERALDINHA_DB_PATH,
  adapter: process.env.ENCRYPTION_ADAPTER,
  key: process.env.ESMERALDINHA_ENCRYPTION_KEY,
};

let tempDir: string;
let dbPath: string;

async function freshApp() {
  const { createApp } = await import('../../app');
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

describe('professores router', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'esmeraldinha-professores-'));
    dbPath = join(tempDir, 'esmeraldinha.db');

    process.env.ESMERALDINHA_DB_PATH = dbPath;
    process.env.ENCRYPTION_ADAPTER = 'dev';
    process.env.ESMERALDINHA_ENCRYPTION_KEY = 'chave-de-teste';

    const vitest = await import('vitest');
    vitest.vi.resetModules();
  });

  afterEach(async () => {
    process.env.ESMERALDINHA_DB_PATH = originalEnv.dbPath;
    process.env.ENCRYPTION_ADAPTER = originalEnv.adapter;
    process.env.ESMERALDINHA_ENCRYPTION_KEY = originalEnv.key;

    const vitest = await import('vitest');
    vitest.vi.resetModules();

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates the schema automatically on a fresh database', async () => {
    const app = await freshApp();

    await app.fetch(
      new Request('http://localhost/api/professores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor()),
      }),
    );

    const db = new DatabaseSync(dbPath);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'professores'")
      .all();
    db.close();

    expect(tables).toHaveLength(1);
  });

  it('cadastra a professor and lists them back', async () => {
    const app = await freshApp();

    const createResponse = await app.fetch(
      new Request('http://localhost/api/professores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor()),
      }),
    );

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created).toMatchObject({ nome: 'Maria da Silva', escola: 'Escola Municipal' });
    expect(created).not.toHaveProperty('senha');

    const listResponse = await app.fetch(new Request('http://localhost/api/professores'));
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json();

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ nome: 'Maria da Silva' });
    expect(list[0]).not.toHaveProperty('senha');
  });

  it('does not store the plaintext senha in senha_encrypted', async () => {
    const app = await freshApp();

    await app.fetch(
      new Request('http://localhost/api/professores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor()),
      }),
    );

    const db = new DatabaseSync(dbPath);
    const row = db.prepare('SELECT senha_encrypted FROM professores').get() as {
      senha_encrypted: Uint8Array;
    };
    db.close();

    const stored = Buffer.from(row.senha_encrypted).toString('utf8');
    expect(stored).not.toContain('senha-secreta');
  });

  it('rejects a duplicate login', async () => {
    const app = await freshApp();

    await app.fetch(
      new Request('http://localhost/api/professores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor()),
      }),
    );

    const response = await app.fetch(
      new Request('http://localhost/api/professores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor({ nome: 'Outro Nome' })),
      }),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it('rejects an invalid CPF', async () => {
    const app = await freshApp();

    const response = await app.fetch(
      new Request('http://localhost/api/professores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor({ login: '111.111.111-11' })),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });
});
