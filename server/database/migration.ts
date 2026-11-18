import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { EncryptionPort } from '../encryption/port';
import {
  AuthFailure,
  type AuthProvider,
  type AuthSession,
} from '../conta/supabase';
import { env } from '../env';
import { transaction, type Database, type DatabaseValue } from './types';
import { migrationTables } from './migration-tables';
import { SCHEMA, migrate } from '../professores/db';

const rowSchema = z.record(z.string(), z.unknown());
export const migrationSchema = z
  .object({
    version: z.literal(1),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    tables: z.record(z.string(), z.array(rowSchema).max(500_000)),
  })
  .strict();
export type MigrationPayload = z.infer<typeof migrationSchema>;

/**
 * Read a consistent source snapshot without modifying its file. The snapshot
 * is a private copy upgraded to the current schema, so an installation that
 * never opened the newer local schema still exports every table.
 */
export async function exportSqlite(
  path: string,
  encryption: EncryptionPort,
): Promise<MigrationPayload> {
  const folder = mkdtempSync(join(tmpdir(), 'esmeraldinha-export-'));
  const snapshot = join(folder, 'snapshot.db');
  try {
    const source = new DatabaseSync(path, { readOnly: true });
    try {
      source.prepare('VACUUM INTO ?').run(snapshot);
    } finally {
      source.close();
    }
    const upgraded = new DatabaseSync(snapshot);
    try {
      upgraded.exec(SCHEMA);
      migrate(upgraded);
    } finally {
      upgraded.close();
    }
    return await exportSnapshot(snapshot, encryption);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

async function exportSnapshot(
  path: string,
  encryption: EncryptionPort,
): Promise<MigrationPayload> {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('BEGIN');
    const integrity = db.prepare('PRAGMA integrity_check').get();
    if (
      !integrity ||
      Object.values(integrity)[0] !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').all().length
    )
      throw new Error(
        'Repair the source integrity or references before importing.',
      );
    const pendingTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE name = 'professor_auth_operations'",
      )
      .get();
    if (
      pendingTable &&
      db
        .prepare('SELECT professor_id FROM professor_auth_operations LIMIT 1')
        .get()
    )
      throw new Error(
        'Complete pending Auth synchronization before importing.',
      );
    const tables: MigrationPayload['tables'] = {};
    for (const [table, columns] of Object.entries(migrationTables)) {
      tables[table] = db
        .prepare(
          `SELECT ${columns.join(', ')} FROM ${table} ORDER BY ${columns.join(', ')}`,
        )
        .all();
    }
    db.exec('COMMIT');
    // The fingerprint includes original ciphertext, never an unkeyed hash of senhas.
    const checksum = createHash('sha256')
      .update(JSON.stringify(tables))
      .digest('hex');
    for (const row of tables.professores) {
      row.senha = await encryption.decrypt(
        Buffer.from(row.senha_encrypted as Uint8Array),
      );
      delete row.senha_encrypted;
    }
    return { version: 1, checksum, tables };
  } finally {
    db.close();
  }
}

/** Import exactly once into an empty application, after checking remote assignments. */
export async function importSqlite(options: {
  db: Database;
  encryption: EncryptionPort;
  auth: AuthProvider;
  session: AuthSession;
  payload: MigrationPayload;
}): Promise<{ counts: Record<string, number>; repeated: boolean }> {
  const { db, encryption, auth, session, payload } = options;
  const expected = Object.keys(migrationTables);
  if (
    Object.keys(payload.tables).length !== expected.length ||
    expected.some((table) => !Array.isArray(payload.tables[table]))
  )
    throw new AuthFailure(
      'O arquivo não contém todas as tabelas esperadas.',
      422,
    );
  if (payload.tables.conta.length !== 1)
    throw new AuthFailure(
      'A origem precisa conter exatamente uma conta do auxiliar de ensino.',
      422,
    );
  const sourceConta = payload.tables.conta[0];
  if (
    sourceConta.supabase_auth_id &&
    sourceConta.supabase_auth_id !== auth.auxiliarId
  )
    throw new AuthFailure('A origem está vinculada a outra identidade.', 409);
  const fingerprint = createHmac(
    'sha256',
    env.serverEncryptionKey || env.devEncryptionKey,
  )
    .update(JSON.stringify(payload))
    .digest('hex');
  const counts = Object.fromEntries(
    expected.map((table) => [table, payload.tables[table].length]),
  );
  async function previousImport(): Promise<
    { counts: Record<string, number>; repeated: boolean } | undefined
  > {
    const prior = (await db
      .prepare(
        'SELECT fingerprint, counts FROM migration_imports WHERE checksum = ?',
      )
      .get(payload.checksum)) as
      | { fingerprint: string; counts: string | Record<string, number> }
      | undefined;
    if (!prior) return undefined;
    if (prior.fingerprint !== fingerprint)
      throw new AuthFailure(
        'A mesma importação foi reenviada com dados diferentes.',
        409,
      );
    return {
      counts:
        typeof prior.counts === 'string'
          ? (JSON.parse(prior.counts) as Record<string, number>)
          : prior.counts,
      repeated: true,
    };
  }
  const completed = await previousImport();
  if (completed) return completed;
  const rows = structuredClone(payload.tables);
  for (const professor of rows.professores) {
    if (typeof professor.senha !== 'string' || !professor.senha)
      throw new AuthFailure(
        'Uma senha do portal não pôde ser lida na origem.',
        422,
      );
    if (['pending', 'verifying'].includes(String(professor.auth_sync_status)))
      throw new AuthFailure(
        'Conclua as confirmações de acesso antes de importar.',
        409,
      );
    if (professor.supabase_auth_id) {
      const assignment = await auth.administer(session, {
        action: 'inspect',
        operationId: randomUUID(),
        professorId: professor.id,
        email: professor.auth_email,
      });
      if (assignment.id !== professor.supabase_auth_id)
        throw new AuthFailure(
          'Confira o vínculo de acesso do professor antes de importar.',
          409,
        );
    } else {
      professor.acesso_liberado = 0;
      professor.auth_sync_status = 'unlinked';
    }
    professor.senha_encrypted = await encryption.encrypt(professor.senha);
    delete professor.senha;
  }
  rows.conta[0] = {
    ...sourceConta,
    senha_hash: null,
    supabase_auth_id: auth.auxiliarId,
    supabase_auth_email: auth.auxiliarEmail,
    auth_setup_complete: 1,
  };
  return transaction(db, async () => {
    // Lock only during SQL writes; Auth checks and encryption happen beforehand.
    await db.exec(
      "SELECT pg_advisory_xact_lock(hashtextextended('esmeraldinha:sqlite-import', 0))",
    );
    await db.exec(
      `LOCK TABLE ${expected.join(', ')} IN SHARE ROW EXCLUSIVE MODE`,
    );
    const prior = await previousImport();
    if (prior) return prior;
    for (const table of ['professores', 'turmas', 'cadernetas']) {
      if (await db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get())
        throw new AuthFailure(
          'O destino já contém dados. A importação exige um destino vazio.',
          409,
        );
    }
    await db.exec('DELETE FROM conta');
    await db.exec('DELETE FROM codigos_cr');
    for (const [table, columns] of Object.entries(migrationTables)) {
      const insert = db.prepare(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      );
      for (const row of rows[table])
        await insert.run(
          ...columns.map((column) => (row[column] ?? null) as DatabaseValue),
        );
      const actual = (await db
        .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
        .get()) as { count: number };
      if (Number(actual.count) !== counts[table])
        throw new Error('Migration row counts do not match.');
    }
    await db
      .prepare(
        'INSERT INTO migration_imports (checksum, fingerprint, counts) VALUES (?, ?, ?)',
      )
      .run(payload.checksum, fingerprint, JSON.stringify(counts));
    return { counts, repeated: false };
  });
}
