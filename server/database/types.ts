import type { SQLInputValue } from 'node:sqlite';

export type DatabaseValue = SQLInputValue;
type Result<T> = T | Promise<T>;

export interface Statement {
  get(...values: DatabaseValue[]): Result<unknown>;
  all(...values: DatabaseValue[]): Result<unknown[]>;
  run(...values: DatabaseValue[]): Result<{ changes: number | bigint }>;
}

/** Shared by local migration fixtures and the controlled Postgres backend. */
export interface Database {
  prepare(sql: string): Statement;
  exec(sql: string): Result<void>;
  transaction?<T>(work: () => Promise<T>): Promise<T>;
  close(): Result<void>;
}

export async function transaction<T>(
  db: Database,
  work: () => Promise<T>,
): Promise<T> {
  if (db.transaction) return db.transaction(work);
  await db.exec('BEGIN');
  try {
    const result = await work();
    await db.exec('COMMIT');
    return result;
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}
