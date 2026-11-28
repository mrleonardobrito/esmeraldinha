import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA } from '../../professores/db';
import { createProfessor, setProfessorAcesso } from '../../professores/store';
import { createProfessorEnrollment } from '../local/professor-enrollment';

let db: DatabaseSync;
let now: number;
let professorId: string;
let enrollment: ReturnType<typeof createProfessorEnrollment>;

describe('local first-access links', () => {
  beforeEach(async () => {
    db = new DatabaseSync(':memory:');
    db.exec(SCHEMA);
    now = 1000;
    enrollment = createProfessorEnrollment(() => db, 'auxiliar', () => now);
    professorId = (await createProfessor(db, {
      encrypt: async (plain) => Buffer.from(plain),
      decrypt: async (cipher) => cipher.toString(),
    }, { nome: 'Maria', login: '52998224725', senha: 'portal', escola: 'Escola' })).id;
  });
  afterEach(() => db.close());

  async function issue() {
    const result = await enrollment.issue(professorId, 'maria@example.test');
    if (result.status !== 'issued') throw new Error('expected link');
    return result.token;
  }

  it('stores only a digest and consumes a valid link exactly once', async () => {
    const token = await issue();
    const stored = db.prepare('SELECT invitation_hash, password_hash FROM professor_accounts').get()!;
    expect(stored.invitation_hash).not.toBe(token);
    expect(stored.password_hash).toBeNull();
    expect(await enrollment.authenticate('maria@example.test', 'password123')).toBeNull();
    const results = await Promise.all([
      enrollment.complete(token, 'password123'),
      enrollment.complete(token, 'another-password'),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await enrollment.complete(token, 'again-password')).toBe(false);
    expect(await enrollment.authenticate('maria@example.test', results[0] ? 'password123' : 'another-password')).toBe(professorId);
  });

  it('invalidates expired, replaced and revoked links', async () => {
    const first = await issue();
    now += 24 * 60 * 60 * 1000;
    expect(await enrollment.complete(first, 'password123')).toBe(false);
    const second = await issue();
    const third = await issue();
    expect(await enrollment.complete(second, 'password123')).toBe(false);
    setProfessorAcesso(db, professorId, false);
    expect(await enrollment.complete(third, 'password123')).toBe(false);
  });

  it('rejects email collisions and clears the old password on reissue', async () => {
    const token = await issue();
    expect(await enrollment.complete(token, 'password123')).toBe(true);
    const other = (await createProfessor(db, {
      encrypt: async (plain) => Buffer.from(plain),
      decrypt: async (cipher) => cipher.toString(),
    }, { nome: 'Outro', login: '11144477735', senha: 'portal', escola: 'Escola' })).id;
    expect(await enrollment.issue(other, 'MARIA@example.test')).toEqual({ status: 'conflict' });
    await issue();
    expect(await enrollment.authenticate('maria@example.test', 'password123')).toBeNull();
  });
});
