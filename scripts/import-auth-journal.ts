import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { PostgresDatabase } from '../server/database/postgres';
import type { DatabaseValue } from '../server/database/types';

const config = z
  .object({
    AUTH_ADMIN_LEGACY_DB_PATH: z.string().min(1),
    AUTH_ADMIN_DATABASE_URL: z.string().min(1),
    DATABASE_CA_PATH: z.string().optional(),
  })
  .safeParse(process.env);
if (!config.success)
  throw new Error(
    'Configure AUTH_ADMIN_LEGACY_DB_PATH and AUTH_ADMIN_DATABASE_URL on the controlled administration machine.',
  );
const source = new DatabaseSync(config.data.AUTH_ADMIN_LEGACY_DB_PATH, {
  readOnly: true,
});
const target = new PostgresDatabase({
  url: config.data.AUTH_ADMIN_DATABASE_URL,
  caPath: config.data.DATABASE_CA_PATH,
  schema: 'esmeraldinha_auth_admin',
  max: 1,
});
const tables = {
  assignments: ['professor_id', 'auth_id', 'email', 'operation_id', 'deleted'],
  operations: ['id', 'professor_id', 'fingerprint', 'complete'],
};
try {
  source.exec('BEGIN');
  const snapshot = Object.fromEntries(
    Object.entries(tables).map(([table, columns]) => [
      table,
      source
        .prepare(`SELECT ${columns.join(', ')} FROM ${table} ORDER BY 1`)
        .all(),
    ]),
  );
  source.exec('COMMIT');
  const normalize = (rows: Record<string, unknown>[], columns: string[]) =>
    rows.map((row) =>
      columns.map((column) =>
        ['deleted', 'complete'].includes(column)
          ? Number(row[column])
          : row[column],
      ),
    );
  const repeated = await target.transaction(async () => {
    await target.exec(
      "SELECT pg_advisory_xact_lock(hashtextextended('esmeraldinha:auth-journal-import', 0))",
    );
    await target.exec(
      'LOCK TABLE assignments, operations IN SHARE ROW EXCLUSIVE MODE',
    );
    const existing = Object.fromEntries(
      await Promise.all(
        Object.keys(tables).map(async (table) => [
          table,
          (await target
            .prepare(`SELECT * FROM ${table} ORDER BY 1`)
            .all()) as Record<string, unknown>[],
        ]),
      ),
    );
    if (Object.values(existing).some((rows) => rows.length)) {
      for (const [table, columns] of Object.entries(tables))
        if (
          JSON.stringify(normalize(existing[table], columns)) !==
          JSON.stringify(normalize(snapshot[table], columns))
        )
          throw new Error(
            'The target journal differs from the source. No existing data was replaced.',
          );
      return true;
    }
    for (const [table, columns] of Object.entries(tables)) {
      for (const row of snapshot[table])
        await target
          .prepare(
            `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          )
          .run(...columns.map((column) => row[column] as DatabaseValue));
      const count = (await target
        .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
        .get()) as { count: number };
      if (Number(count.count) !== snapshot[table].length)
        throw new Error('Journal row counts do not match.');
    }
    return false;
  });
  console.log(
    JSON.stringify({
      assignments: snapshot.assignments.length,
      operations: snapshot.operations.length,
      repeated,
    }),
  );
} finally {
  source.close();
  await target.close();
}
