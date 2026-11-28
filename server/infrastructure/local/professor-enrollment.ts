import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { hashDeSenha, senhaConfere } from '../../conta/senhas';
import type { EnrollmentResult } from '../../modules/identity';

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export function createProfessorEnrollment(db: () => DatabaseSync, auxiliaryLogin: string, now = Date.now) {
  return {
    async authenticate(email: string, senha: string): Promise<string | null> {
      const row = db().prepare(
        'SELECT professor_id, password_hash FROM professor_accounts WHERE email = ? COLLATE NOCASE',
      ).get(email.trim()) as { professor_id: string; password_hash: string | null } | undefined;
      if (!row?.password_hash || !(await senhaConfere(senha, row.password_hash))) return null;
      // Reject a password reset/reissue that happened while scrypt was running.
      const current = db().prepare('SELECT password_hash FROM professor_accounts WHERE professor_id = ?')
        .get(row.professor_id) as { password_hash: string | null } | undefined;
      return current?.password_hash === row.password_hash ? row.professor_id : null;
    },

    async issue(professorId: string, email: string): Promise<EnrollmentResult> {
      const database = db();
      const normalized = email.trim().toLowerCase();
      const auxiliary = database.prepare('SELECT login FROM conta LIMIT 1').get() as { login: string } | undefined;
      if (normalized === (auxiliary?.login ?? auxiliaryLogin).trim().toLowerCase()) return { status: 'conflict' };
      const token = randomBytes(32).toString('base64url');
      const expires = now() + INVITATION_TTL_MS;
      database.exec('BEGIN IMMEDIATE');
      try {
        if (!database.prepare('SELECT id FROM professores WHERE id = ?').get(professorId)) {
          database.exec('ROLLBACK');
          return { status: 'not_found' };
        }
        if (database.prepare('SELECT 1 FROM professor_accounts WHERE email = ? COLLATE NOCASE AND professor_id != ?').get(normalized, professorId)) {
          database.exec('ROLLBACK');
          return { status: 'conflict' };
        }
        // A reissue is an explicit reset. The old password and link cease to work.
        database.prepare(`INSERT INTO professor_accounts (professor_id, email, password_hash, invitation_hash, invitation_expires_at)
          VALUES (?, ?, NULL, ?, ?)
          ON CONFLICT(professor_id) DO UPDATE SET email = excluded.email, password_hash = NULL,
            invitation_hash = excluded.invitation_hash, invitation_expires_at = excluded.invitation_expires_at`)
          .run(professorId, normalized, digest(token), expires);
        database.prepare('UPDATE professores SET acesso_liberado = 0 WHERE id = ?').run(professorId);
        database.exec('COMMIT');
        return { status: 'issued', token, expiresAt: new Date(expires).toISOString() };
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },

    async complete(token: string, senha: string): Promise<boolean> {
      const database = db();
      const hash = digest(token);
      const candidate = database.prepare(
        'SELECT professor_id FROM professor_accounts WHERE invitation_hash = ? AND invitation_expires_at > ? AND password_hash IS NULL',
      ).get(hash, now()) as { professor_id: string } | undefined;
      if (!candidate) return false;
      const passwordHash = await hashDeSenha(senha);
      database.exec('BEGIN IMMEDIATE');
      try {
        const result = database.prepare(`UPDATE professor_accounts SET password_hash = ?, invitation_hash = NULL, invitation_expires_at = NULL
          WHERE professor_id = ? AND invitation_hash = ? AND invitation_expires_at > ? AND password_hash IS NULL`)
          .run(passwordHash, candidate.professor_id, hash, now());
        if (result.changes !== 1) {
          database.exec('ROLLBACK');
          return false;
        }
        const enabled = database.prepare('UPDATE professores SET acesso_liberado = 1 WHERE id = ?').run(candidate.professor_id);
        if (enabled.changes !== 1) {
          database.exec('ROLLBACK');
          return false;
        }
        database.exec('COMMIT');
        return true;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
