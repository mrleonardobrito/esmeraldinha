import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { env } from '../env';

let db: DatabaseSync | undefined;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS professores (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    login TEXT NOT NULL UNIQUE,
    senha_encrypted BLOB NOT NULL,
    escola TEXT NOT NULL,
    imagem TEXT,
    created_at TEXT NOT NULL
  );
`;

/**
 * Opens (or reuses) the SQLite connection backing the professores store, at
 * the path configured by `env.dbPath`. The schema is created on first run,
 * so a fresh install needs no migration step.
 */
export function getDb(): DatabaseSync {
  if (db) return db;

  if (env.dbPath !== ':memory:') {
    mkdirSync(dirname(env.dbPath), { recursive: true });
  }

  db = new DatabaseSync(env.dbPath);
  db.exec(SCHEMA);

  return db;
}

/** Closes the current connection so a later `getDb()` call reopens fresh. */
export function closeDb(): void {
  db?.close();
  db = undefined;
}
