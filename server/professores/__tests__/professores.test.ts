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

  it('edits a professor', async () => {
    const app = await freshApp();

    const createResponse = await app.fetch(
      new Request('http://localhost/api/professores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor()),
      }),
    );
    const created = await createResponse.json();

    const updateResponse = await app.fetch(
      new Request(`http://localhost/api/professores/${created.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor({ nome: 'Maria Souza', escola: 'Escola Estadual' })),
      }),
    );

    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();
    expect(updated).toMatchObject({ id: created.id, nome: 'Maria Souza', escola: 'Escola Estadual' });
    expect(updated).not.toHaveProperty('senha');
  });

  it('accepts the null imagem it hands back for a professor without one', async () => {
    const app = await freshApp();

    const createResponse = await app.fetch(
      new Request('http://localhost/api/professores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor()),
      }),
    );
    const created = await createResponse.json();
    expect(created.imagem).toBeNull();

    // O formulário de edição devolve o professor do jeito que o recebeu:
    // a imagem ausente volta como null, não como campo omitido.
    const updateResponse = await app.fetch(
      new Request(`http://localhost/api/professores/${created.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...novoProfessor({ nome: 'Maria Souza' }), imagem: null }),
      }),
    );

    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();
    expect(updated).toMatchObject({ id: created.id, nome: 'Maria Souza', imagem: null });
  });

  it('leaves the stored senha unchanged when editing without one', async () => {
    const app = await freshApp();

    const createResponse = await app.fetch(
      new Request('http://localhost/api/professores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor()),
      }),
    );
    const created = await createResponse.json();

    const dbBefore = new DatabaseSync(dbPath);
    const before = dbBefore.prepare('SELECT senha_encrypted FROM professores WHERE id = ?').get(created.id) as {
      senha_encrypted: Uint8Array;
    };
    dbBefore.close();

    const comSenha = novoProfessor({ nome: 'Maria Souza' });
    const semSenha: Partial<typeof comSenha> = { ...comSenha };
    delete semSenha.senha;
    const updateResponse = await app.fetch(
      new Request(`http://localhost/api/professores/${created.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(semSenha),
      }),
    );

    expect(updateResponse.status).toBe(200);

    const dbAfter = new DatabaseSync(dbPath);
    const after = dbAfter.prepare('SELECT senha_encrypted FROM professores WHERE id = ?').get(created.id) as {
      senha_encrypted: Uint8Array;
    };
    dbAfter.close();

    expect(Buffer.from(after.senha_encrypted).equals(Buffer.from(before.senha_encrypted))).toBe(
      true,
    );
  });

  it('replaces the senha, still encrypted, when a new one is supplied', async () => {
    const app = await freshApp();

    const createResponse = await app.fetch(
      new Request('http://localhost/api/professores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor()),
      }),
    );
    const created = await createResponse.json();

    const updateResponse = await app.fetch(
      new Request(`http://localhost/api/professores/${created.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor({ senha: 'nova-senha-secreta' })),
      }),
    );

    expect(updateResponse.status).toBe(200);

    const db = new DatabaseSync(dbPath);
    const row = db.prepare('SELECT senha_encrypted FROM professores WHERE id = ?').get(created.id) as {
      senha_encrypted: Uint8Array;
    };
    db.close();

    const stored = Buffer.from(row.senha_encrypted).toString('utf8');
    expect(stored).not.toContain('senha-secreta');
    expect(stored).not.toContain('nova-senha-secreta');
  });

  it('rejects a duplicate login on edit', async () => {
    const app = await freshApp();

    await app.fetch(
      new Request('http://localhost/api/professores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor()),
      }),
    );

    const secondResponse = await app.fetch(
      new Request('http://localhost/api/professores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor({ nome: 'Outro Nome', login: '529.982.247-25' })),
      }),
    );
    const second = await secondResponse.json();

    const updateResponse = await app.fetch(
      new Request(`http://localhost/api/professores/${second.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor()),
      }),
    );

    expect(updateResponse.status).toBe(409);
    const body = await updateResponse.json();
    expect(body.error).toBeTruthy();
  });

  it('rejects an invalid CPF on edit', async () => {
    const app = await freshApp();

    const createResponse = await app.fetch(
      new Request('http://localhost/api/professores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor()),
      }),
    );
    const created = await createResponse.json();

    const updateResponse = await app.fetch(
      new Request(`http://localhost/api/professores/${created.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor({ login: '111.111.111-11' })),
      }),
    );

    expect(updateResponse.status).toBe(400);
    const body = await updateResponse.json();
    expect(body.error).toBeTruthy();
  });

  it('deletes a professor, removing the row and its encrypted senha', async () => {
    const app = await freshApp();

    const createResponse = await app.fetch(
      new Request('http://localhost/api/professores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor()),
      }),
    );
    const created = await createResponse.json();

    const deleteResponse = await app.fetch(
      new Request(`http://localhost/api/professores/${created.id}`, { method: 'DELETE' }),
    );

    expect(deleteResponse.status).toBe(204);

    const db = new DatabaseSync(dbPath);
    const row = db.prepare('SELECT id FROM professores WHERE id = ?').get(created.id);
    db.close();

    expect(row).toBeUndefined();

    const listResponse = await app.fetch(new Request('http://localhost/api/professores'));
    const list = await listResponse.json();
    expect(list).toHaveLength(0);
  });

  it('returns 404 when editing a professor that does not exist', async () => {
    const app = await freshApp();

    const response = await app.fetch(
      new Request('http://localhost/api/professores/id-inexistente', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(novoProfessor()),
      }),
    );

    expect(response.status).toBe(404);
  });

  it('returns 404 when deleting a professor that does not exist', async () => {
    const app = await freshApp();

    const response = await app.fetch(
      new Request('http://localhost/api/professores/id-inexistente', { method: 'DELETE' }),
    );

    expect(response.status).toBe(404);
  });
});
