import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { SCHEMA, migrate } from '../db';

/** O formato que as tabelas do boletim tinham antes de a disciplina existir. */
const SCHEMA_ANTIGO = `
  CREATE TABLE professores (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    login TEXT NOT NULL UNIQUE,
    senha_encrypted BLOB NOT NULL,
    escola TEXT NOT NULL,
    imagem TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE cadernetas (
    id TEXT PRIMARY KEY,
    professor_id TEXT NOT NULL,
    turma TEXT NOT NULL,
    turno TEXT,
    created_at TEXT NOT NULL,
    synced_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'pendente',
    sync_error TEXT,
    UNIQUE (professor_id, turma)
  );

  CREATE TABLE caderneta_avaliacoes (
    caderneta_id TEXT NOT NULL,
    etapa TEXT NOT NULL,
    nome TEXT NOT NULL,
    tipo TEXT,
    data TEXT,
    valor REAL,
    posicao INTEGER NOT NULL,
    PRIMARY KEY (caderneta_id, etapa, nome)
  );

  CREATE TABLE caderneta_notas (
    caderneta_id TEXT NOT NULL,
    etapa TEXT NOT NULL,
    matricula TEXT NOT NULL,
    avaliacao TEXT NOT NULL,
    valor REAL NOT NULL,
    PRIMARY KEY (caderneta_id, etapa, matricula, avaliacao)
  );
`;

/** Um professor e a caderneta dele: as chaves estrangeiras exigem os dois. */
async function semearCaderneta(db: DatabaseSync): Promise<void> {
  await db
    .prepare(
      `INSERT INTO professores (id, nome, login, senha_encrypted, escola, created_at)
     VALUES ('p1', 'Maria', '111', X'00', 'Escola', '2026-01-01T00:00:00.000Z')`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO cadernetas (id, professor_id, turma, created_at)
     VALUES ('c1', 'p1', '3º ANO A', '2026-01-01T00:00:00.000Z')`,
    )
    .run();
}

async function colunas(db: DatabaseSync, tabela: string): Promise<string[]> {
  const rows = (await db
    .prepare(`PRAGMA table_info(${tabela})`)
    .all()) as unknown as {
    name: string;
  }[];

  return rows.map((row) => row.name);
}

describe('migrate: tabelas do boletim', () => {
  it('acrescenta a disciplina às tabelas que nasceram sem ela', async () => {
    const db = new DatabaseSync(':memory:');
    await db.exec(SCHEMA_ANTIGO);
    await db.exec(SCHEMA);

    migrate(db);

    expect(await colunas(db, 'caderneta_avaliacoes')).toContain('disciplina');
    expect(await colunas(db, 'caderneta_notas')).toContain('disciplina');
    expect(await colunas(db, 'caderneta_notas_do_estudante')).toContain(
      'disciplina',
    );
  });

  it('deixa a caderneta e as suas aulas em paz', async () => {
    const db = new DatabaseSync(':memory:');
    await db.exec(SCHEMA_ANTIGO);
    await db.exec(SCHEMA);
    await semearCaderneta(db);

    migrate(db);

    const { total } = (await db
      .prepare('SELECT COUNT(*) AS total FROM cadernetas')
      .get()) as unknown as { total: number };
    expect(Number(total)).toBe(1);
  });

  it('não recria as tabelas quando o banco já está em dia', async () => {
    const db = new DatabaseSync(':memory:');
    await db.exec(SCHEMA);
    await semearCaderneta(db);
    migrate(db);

    await db
      .prepare(
        `INSERT INTO caderneta_disciplinas (caderneta_id, nome, posicao)
       VALUES ('c1', 'MATEMÁTICA', 0)`,
      )
      .run();

    // A segunda passada é a que aconteceria no próximo `getDb()`.
    migrate(db);

    const { total } = (await db
      .prepare('SELECT COUNT(*) AS total FROM caderneta_disciplinas')
      .get()) as unknown as { total: number };
    expect(Number(total)).toBe(1);
  });

  it('grava uma avaliação com disciplina depois de migrar', async () => {
    const db = new DatabaseSync(':memory:');
    await db.exec(SCHEMA_ANTIGO);
    await db.exec(SCHEMA);
    await semearCaderneta(db);

    migrate(db);

    // É exatamente o INSERT que quebrava com "no column named disciplina".
    expect(
      async () =>
        await db
          .prepare(
            `INSERT INTO caderneta_avaliacoes
             (caderneta_id, etapa, disciplina, nome, tipo, data, valor, media, posicao)
           VALUES ('c1', '1ª Etapa', 'MATEMÁTICA', 'PROVA 1', NULL, NULL, 10, 5, 0)`,
          )
          .run(),
    ).not.toThrow();
  });
});
