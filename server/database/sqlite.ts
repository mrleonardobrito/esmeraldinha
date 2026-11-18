import { AsyncLocalStorage } from 'node:async_hooks';
import type { DatabaseSync } from 'node:sqlite';
import type { Database, DatabaseValue } from './types';

/** Serialize asynchronous transactions while retaining SQLite for local development. */
export class SqliteDatabase implements Database {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly current = new AsyncLocalStorage<boolean>();
  constructor(private readonly db: DatabaseSync) {}

  private async exclusive<T>(work: () => T | Promise<T>): Promise<T> {
    if (this.current.getStore()) return work();
    const pending = this.tail
      .catch(() => {})
      .then(() => this.current.run(true, work));
    this.tail = pending;
    return pending;
  }

  prepare(sql: string) {
    return {
      get: (...values: DatabaseValue[]) =>
        this.exclusive(() => this.db.prepare(sql).get(...values)),
      all: (...values: DatabaseValue[]) =>
        this.exclusive(() => this.db.prepare(sql).all(...values)),
      run: (...values: DatabaseValue[]) =>
        this.exclusive(() => this.db.prepare(sql).run(...values)),
    };
  }
  async exec(sql: string): Promise<void> {
    await this.exclusive(() => this.db.exec(sql));
  }
  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.current.getStore()) return work();
    return this.exclusive(async () => {
      this.db.exec('BEGIN');
      try {
        const result = await work();
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    });
  }
  async close(): Promise<void> {
    await this.exclusive(() => this.db.close());
  }
}
