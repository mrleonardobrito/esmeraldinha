import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { postgresBindings } from './postgres';
import { SqliteDatabase } from './sqlite';
import { ServerEncryptionAdapter } from '../encryption/server-encryption-adapter';

describe('asynchronous persistence boundary', () => {
  it('binds values while retaining question marks in SQL literals and comments', () => {
    expect(postgresBindings('SELECT \'?\', "?", ? -- ?\n, ? /* ? */')).toBe(
      'SELECT \'?\', "?", $1 -- ?\n, $2 /* ? */',
    );
  });
  it('rolls back a failed batch and does not expose uncommitted changes to concurrent work', async () => {
    const raw = new DatabaseSync(':memory:');
    raw.exec('CREATE TABLE values_to_import (id INTEGER PRIMARY KEY)');
    const db = new SqliteDatabase(raw);
    let release!: () => void;
    let written!: () => void;
    const ready = new Promise<void>((resolve) => {
      written = resolve;
    });
    const first = db.transaction(async () => {
      await db.prepare('INSERT INTO values_to_import VALUES (?)').run(1);
      written();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      throw new Error('Injected failure');
    });
    const rejected = expect(first).rejects.toThrow('Injected failure');
    await ready;
    const other = db.prepare('SELECT * FROM values_to_import').all();
    release();
    await rejected;
    expect(await other).toEqual([]);
    await db.close();
  });
});

describe('controlled server encryption', () => {
  it('rejects missing, malformed, and short keys', () => {
    for (const key of ['', 'not-a-key', randomBytes(16).toString('base64')])
      expect(() => new ServerEncryptionAdapter(key)).toThrow();
  });
  it('requires the same server key and detects modified ciphertext', async () => {
    const first = new ServerEncryptionAdapter(
      randomBytes(32).toString('base64'),
    );
    const second = new ServerEncryptionAdapter(
      randomBytes(32).toString('base64'),
    );
    const encrypted = await first.encrypt('portal-senha');
    expect(encrypted.toString()).not.toContain('portal-senha');
    expect(await first.decrypt(encrypted)).toBe('portal-senha');
    await expect(second.decrypt(encrypted)).rejects.toThrow();
    encrypted[encrypted.length - 1] ^= 1;
    await expect(first.decrypt(encrypted)).rejects.toThrow();
  });
});
