import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import { migrate } from '../db';

/** O schema de `caderneta_aulas` antes das colunas de conteúdo. */
const SCHEMA_ANTIGO = `
  CREATE TABLE caderneta_aulas (
    caderneta_id TEXT NOT NULL,
    etapa TEXT NOT NULL,
    mes TEXT NOT NULL,
    data TEXT NOT NULL,
    ordem INTEGER NOT NULL,
    conteudo_preenchido INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (caderneta_id, etapa, data, ordem)
  );
`;

function colunas(db: DatabaseSync): string[] {
  const rows = db
    .prepare('PRAGMA table_info(caderneta_aulas)')
    .all() as unknown as { name: string }[];

  return rows.map((row) => row.name);
}

describe('migrate', () => {
  it('acrescenta as colunas de conteúdo a um banco antigo, preservando as aulas', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(SCHEMA_ANTIGO);
    db.prepare(
      `INSERT INTO caderneta_aulas (caderneta_id, etapa, mes, data, ordem, conteudo_preenchido)
       VALUES ('c1', '1ª Etapa', 'MARÇO', '05/03/2026', 1, 1)`,
    ).run();

    migrate(db);

    expect(colunas(db)).toEqual(
      expect.arrayContaining(['codigo_cr', 'desenvolvimento', 'ferramentas']),
    );
    expect(
      db.prepare('SELECT data, desenvolvimento FROM caderneta_aulas').all(),
    ).toEqual([{ data: '05/03/2026', desenvolvimento: null }]);
  });

  it('não faz nada quando as colunas já existem', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(SCHEMA_ANTIGO);

    migrate(db);
    const depoisDaPrimeira = colunas(db);
    migrate(db);

    expect(colunas(db)).toEqual(depoisDaPrimeira);
  });
});
