import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { EncryptionPort } from '../encryption';
import type { ProfessorInput, ProfessorUpdateInput } from '../../shared/professor';
import type { ProfessorCredenciais } from '../scrape/types';

/** A professor as returned by the API: never carries the senha. */
export interface Professor {
  id: string;
  nome: string;
  login: string;
  escola: string;
  imagem: string | null;
  createdAt: string;
}

/** Raised when `login` already belongs to a cadastrado professor. */
export class DuplicateLoginError extends Error {
  constructor(login: string) {
    super(`Já existe um professor cadastrado com o login ${login}.`);
    this.name = 'DuplicateLoginError';
  }
}

/** Raised when a professor id does not match any cadastrado professor. */
export class ProfessorNotFoundError extends Error {
  constructor(id: string) {
    super(`Nenhum professor encontrado com o id ${id}.`);
    this.name = 'ProfessorNotFoundError';
  }
}

interface ProfessorRow {
  id: string;
  nome: string;
  login: string;
  escola: string;
  imagem: string | null;
  created_at: string;
}

function toProfessor(row: ProfessorRow): Professor {
  return {
    id: row.id,
    nome: row.nome,
    login: row.login,
    escola: row.escola,
    imagem: row.imagem,
    createdAt: row.created_at,
  };
}

/** Lists every professor cadastrado. Never includes the senha. */
export function listProfessores(db: DatabaseSync): Professor[] {
  const rows = db
    .prepare(
      'SELECT id, nome, login, escola, imagem, created_at FROM professores ORDER BY created_at ASC',
    )
    .all() as unknown as ProfessorRow[];

  return rows.map(toProfessor);
}

/**
 * Cadastra a professor: the senha is encrypted through `encryption` before
 * it is written, and it is never included in the returned `Professor`.
 *
 * @throws {DuplicateLoginError} when `login` already belongs to another
 * professor.
 */
export async function createProfessor(
  db: DatabaseSync,
  encryption: EncryptionPort,
  input: ProfessorInput,
): Promise<Professor> {
  const existing = db
    .prepare('SELECT id FROM professores WHERE login = ?')
    .get(input.login);

  if (existing) {
    throw new DuplicateLoginError(input.login);
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const senhaEncrypted = await encryption.encrypt(input.senha);

  db.prepare(
    `INSERT INTO professores (id, nome, login, senha_encrypted, escola, imagem, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.nome,
    input.login,
    senhaEncrypted,
    input.escola,
    input.imagem ?? null,
    createdAt,
  );

  return {
    id,
    nome: input.nome,
    login: input.login,
    escola: input.escola,
    imagem: input.imagem ?? null,
    createdAt,
  };
}

/**
 * Updates a cadastrado professor. Omitting `senha` leaves the stored
 * encrypted senha untouched; supplying one replaces it, still encrypted.
 *
 * @throws {ProfessorNotFoundError} when `id` matches no professor.
 * @throws {DuplicateLoginError} when `login` belongs to another professor.
 */
export async function updateProfessor(
  db: DatabaseSync,
  encryption: EncryptionPort,
  id: string,
  input: ProfessorUpdateInput,
): Promise<Professor> {
  const existing = db.prepare('SELECT id FROM professores WHERE id = ?').get(id) as
    | { id: string }
    | undefined;

  if (!existing) {
    throw new ProfessorNotFoundError(id);
  }

  const duplicate = db
    .prepare('SELECT id FROM professores WHERE login = ? AND id != ?')
    .get(input.login, id);

  if (duplicate) {
    throw new DuplicateLoginError(input.login);
  }

  if (input.senha) {
    const senhaEncrypted = await encryption.encrypt(input.senha);
    db.prepare(
      `UPDATE professores SET nome = ?, login = ?, senha_encrypted = ?, escola = ?, imagem = ?
       WHERE id = ?`,
    ).run(input.nome, input.login, senhaEncrypted, input.escola, input.imagem ?? null, id);
  } else {
    db.prepare(
      `UPDATE professores SET nome = ?, login = ?, escola = ?, imagem = ?
       WHERE id = ?`,
    ).run(input.nome, input.login, input.escola, input.imagem ?? null, id);
  }

  const row = db
    .prepare('SELECT id, nome, login, escola, imagem, created_at FROM professores WHERE id = ?')
    .get(id) as unknown as ProfessorRow;

  return toProfessor(row);
}

/**
 * Deletes a professor, removing the row and its encrypted senha.
 *
 * @throws {ProfessorNotFoundError} when `id` matches no professor.
 */
export function deleteProfessor(db: DatabaseSync, id: string): void {
  const result = db.prepare('DELETE FROM professores WHERE id = ?').run(id);

  if (result.changes === 0) {
    throw new ProfessorNotFoundError(id);
  }
}

interface CredenciaisRow {
  login: string;
  senha_encrypted: Uint8Array;
  escola: string;
}

/**
 * Resolves and decrypts the credenciais do professor identified by `id`,
 * ready to hand to `openSession`. Returns `undefined` when no professor
 * with that id is cadastrado — distinct from a portal rejection, which
 * only happens once credentials actually reach the portal.
 */
export async function getProfessorCredenciais(
  db: DatabaseSync,
  encryption: EncryptionPort,
  id: string,
): Promise<ProfessorCredenciais | undefined> {
  const row = db
    .prepare('SELECT login, senha_encrypted, escola FROM professores WHERE id = ?')
    .get(id) as unknown as CredenciaisRow | undefined;

  if (!row) return undefined;

  const senha = await encryption.decrypt(Buffer.from(row.senha_encrypted));

  return {
    login: row.login,
    senha,
    escola: row.escola,
  };
}
