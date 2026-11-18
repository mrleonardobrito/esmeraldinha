import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { Pool, types, type PoolClient } from 'pg';
import type { Database, DatabaseValue } from './types';

/** Convert SQLite-style bindings without interpreting question marks in SQL literals. */
export function postgresBindings(sql: string): string {
  let position = 0;
  return sql.replace(
    /'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?/g,
    (match) => (match === '?' ? `$${++position}` : match),
  );
}

export class PostgresDatabase implements Database {
  private readonly pool: Pool;
  private readonly current = new AsyncLocalStorage<PoolClient>();

  constructor(settings: {
    url: string;
    caPath?: string;
    max?: number;
    schema?: 'esmeraldinha' | 'esmeraldinha_auth_admin';
  }) {
    let endpoint: URL;
    try {
      endpoint = new URL(settings.url);
    } catch {
      throw new Error('Configure a valid Postgres connection URL.');
    }
    if (!['postgres:', 'postgresql:'].includes(endpoint.protocol))
      throw new Error('Use a Postgres connection URL.');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(
      endpoint.hostname,
    );
    // URL SSL options must not override certificate verification in the driver.
    endpoint.search = '';
    this.pool = new Pool({
      connectionString: endpoint.toString(),
      ssl: local
        ? false
        : {
            rejectUnauthorized: true,
            ...(settings.caPath
              ? { ca: readFileSync(settings.caPath, 'utf8') }
              : {}),
          },
      max: settings.max ?? 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
      idle_in_transaction_session_timeout: 15_000,
      application_name: 'esmeraldinha',
      options: `-c search_path=${settings.schema ?? 'esmeraldinha'},pg_catalog`,
      types: {
        getTypeParser(oid, format) {
          if (format !== 'binary' && [20, 1700].includes(oid))
            return (value: string) => Number(value);
          if (format !== 'binary' && [1184, 1114].includes(oid))
            return (value: string) => new Date(value).toISOString();
          if (format !== 'binary' && oid === 3802)
            return (value: string) => value;
          return types.getTypeParser(oid, format);
        },
      },
    });
    this.pool.on('error', () =>
      console.error('An idle database connection was lost.'),
    );
  }

  private async query(sql: string, values: DatabaseValue[] = []) {
    const connection = this.current.getStore() ?? this.pool;
    return connection.query(
      postgresBindings(sql),
      values.map((value) =>
        value instanceof Uint8Array ? Buffer.from(value) : value,
      ),
    );
  }

  prepare(sql: string) {
    return {
      get: async (...values: DatabaseValue[]) =>
        (await this.query(sql, values)).rows[0] as unknown,
      all: async (...values: DatabaseValue[]) =>
        (await this.query(sql, values)).rows as unknown[],
      run: async (...values: DatabaseValue[]) => ({
        changes: (await this.query(sql, values)).rowCount ?? 0,
      }),
    };
  }

  async exec(sql: string): Promise<void> {
    await this.query(sql);
  }

  async verifyRuntimeRole(journal = false): Promise<void> {
    const result = await this.query(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    );
    if (
      !result.rows[0] ||
      result.rows[0].rolsuper ||
      result.rows[0].rolbypassrls
    )
      throw new Error(
        'Use a dedicated runtime login without superuser or BYPASSRLS.',
      );
    await this.query(
      journal
        ? 'SELECT id FROM operations LIMIT 0'
        : 'SELECT checksum FROM migration_imports LIMIT 0',
    );
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    const parent = this.current.getStore();
    if (parent) return work();
    const connection = await this.pool.connect();
    try {
      await connection.query('BEGIN');
      const result = await this.current.run(connection, work);
      await connection.query('COMMIT');
      return result;
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
