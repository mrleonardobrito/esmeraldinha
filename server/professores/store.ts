import { callData } from '../database/remote';
import { env } from '../env';
import { randomUUID } from 'node:crypto';
import type { Database } from '../database/types';

import type { EncryptionPort } from '../encryption';
import type {
  ProfessorInput,
  ProfessorUpdateInput,
} from '../../shared/professor';
import type { ProfessorCredenciais } from '../scrape/types';
import { textoConfere } from '../conta/senhas';

/** A professor as returned by the API: never carries the senha. */
export interface Professor {
  email?: string;
  authStatus?: string;
  id: string;
  nome: string;
  login: string;
  escola: string;
  imagem: string | null;
  acessoLiberado: boolean;
  createdAt: string;
  valorRecebidoTotal?: number;
  valorAReceberTotal?: number;
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
  auth_email?: string;
  auth_sync_status?: string;
  id: string;
  nome: string;
  login: string;
  escola: string;
  imagem: string | null;
  acesso_liberado: number;
  created_at: string;
  valor_recebido_total?: number;
  valor_a_receber_total?: number;
}

function toProfessor(row: ProfessorRow): Professor {
  return {
    id: row.id,
    nome: row.nome,
    login: row.login,
    escola: row.escola,
    imagem: row.imagem,
    acessoLiberado: Number(row.acesso_liberado) === 1,
    createdAt: row.created_at,
    ...(row.auth_email ? { email: row.auth_email } : {}),
    ...(row.auth_sync_status && row.auth_sync_status !== 'unlinked'
      ? { authStatus: row.auth_sync_status }
      : {}),
    ...(row.valor_recebido_total !== undefined
      ? {
          valorRecebidoTotal: row.valor_recebido_total,
          valorAReceberTotal: row.valor_a_receber_total,
        }
      : {}),
  };
}

/** Um professor pelo id, sem expor a senha guardada. */
export async function getProfessor(
  db: Database,
  id: string,
): Promise<Professor | null> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof getProfessor>>>(
      'professores.getProfessor',
      [id],
    );
  const row = (await db
    .prepare(
      'SELECT id, nome, login, escola, imagem, acesso_liberado, created_at, auth_email, auth_sync_status FROM professores WHERE id = ?',
    )
    .get(id)) as unknown as ProfessorRow | undefined;
  return row ? toProfessor(row) : null;
}

/** Finds a professor by portal login without reading their senha. */
export async function getProfessorPorLogin(
  db: Database,
  login: string,
): Promise<Professor | null> {
  const row = (await db
    .prepare(
      'SELECT id, nome, login, escola, imagem, acesso_liberado, created_at, auth_email, auth_sync_status FROM professores WHERE login = ?',
    )
    .get(login)) as unknown as ProfessorRow | undefined;
  return row ? toProfessor(row) : null;
}

/** Localiza o professor pelo CPF e confere sua senha do portal sem expô-la. */
export async function autenticarProfessor(
  db: Database,
  encryption: EncryptionPort,
  login: string,
  senha: string,
): Promise<Professor | null> {
  const row = (await db
    .prepare(
      'SELECT id, nome, login, senha_encrypted, escola, imagem, acesso_liberado, created_at FROM professores WHERE login = ?',
    )
    .get(login)) as unknown as
    | (ProfessorRow & { senha_encrypted: Uint8Array })
    | undefined;
  if (!row) return null;

  const senhaGuardada = await encryption.decrypt(
    Buffer.from(row.senha_encrypted),
  );
  return Number(row.acesso_liberado) === 1 && textoConfere(senha, senhaGuardada)
    ? toProfessor(row)
    : null;
}

/** Lists every professor cadastrado. Never includes the senha. */
export async function listProfessores(db: Database): Promise<Professor[]> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof listProfessores>>>(
      'professores.listProfessores',
      [],
    );
  const rows = (await db
    .prepare(
      `SELECT p.id, p.nome, p.login, p.escola, p.imagem, p.acesso_liberado, p.created_at, p.auth_email, p.auth_sync_status,
        COALESCE((SELECT SUM(c.valor_recebido) FROM cadernetas c WHERE c.professor_id = p.id), 0) AS valor_recebido_total,
        COALESCE((SELECT SUM(c.valor_a_receber) FROM cadernetas c WHERE c.professor_id = p.id), 0) AS valor_a_receber_total
       FROM professores p ORDER BY p.created_at ASC`,
    )
    .all()) as unknown as ProfessorRow[];

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
  db: Database,
  encryption: EncryptionPort,
  input: ProfessorInput,
): Promise<Professor> {
  const existing = await db
    .prepare('SELECT id FROM professores WHERE login = ?')
    .get(input.login);

  if (existing) {
    throw new DuplicateLoginError(input.login);
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const senhaEncrypted = await encryption.encrypt(input.senha);

  await db
    .prepare(
      `INSERT INTO professores (id, nome, login, senha_encrypted, escola, imagem, acesso_liberado, created_at, auth_email)
     VALUES (?, ?, ?, ?, ?, ?, FALSE, ?, ?)`,
    )
    .run(
      id,
      input.nome,
      input.login,
      senhaEncrypted,
      input.escola,
      input.imagem ?? null,
      createdAt,
      input.email?.toLowerCase() ?? '',
    );

  return (await getProfessor(db, id))!;
}

/**
 * Updates a cadastrado professor. Omitting `senha` leaves the stored
 * encrypted senha untouched; supplying one replaces it, still encrypted.
 *
 * @throws {ProfessorNotFoundError} when `id` matches no professor.
 * @throws {DuplicateLoginError} when `login` belongs to another professor.
 */
export async function updateProfessor(
  db: Database,
  encryption: EncryptionPort,
  id: string,
  input: ProfessorUpdateInput,
): Promise<Professor> {
  const existing = (await db
    .prepare('SELECT id FROM professores WHERE id = ?')
    .get(id)) as { id: string } | undefined;

  if (!existing) {
    throw new ProfessorNotFoundError(id);
  }

  const duplicate = await db
    .prepare('SELECT id FROM professores WHERE login = ? AND id != ?')
    .get(input.login, id);

  if (duplicate) {
    throw new DuplicateLoginError(input.login);
  }

  if (input.senha) {
    const senhaEncrypted = await encryption.encrypt(input.senha);
    await db
      .prepare(
        `UPDATE professores SET nome = ?, login = ?, senha_encrypted = ?, escola = ?, imagem = ?, auth_email = COALESCE(?, auth_email)
       WHERE id = ?`,
      )
      .run(
        input.nome,
        input.login,
        senhaEncrypted,
        input.escola,
        input.imagem ?? null,
        input.email?.toLowerCase() ?? null,
        id,
      );
  } else {
    await db
      .prepare(
        `UPDATE professores SET nome = ?, login = ?, escola = ?, imagem = ?, auth_email = COALESCE(?, auth_email)
       WHERE id = ?`,
      )
      .run(
        input.nome,
        input.login,
        input.escola,
        input.imagem ?? null,
        input.email?.toLowerCase() ?? null,
        id,
      );
  }

  const row = (await db
    .prepare(
      'SELECT id, nome, login, escola, imagem, acesso_liberado, created_at, auth_email, auth_sync_status FROM professores WHERE id = ?',
    )
    .get(id)) as unknown as ProfessorRow;

  return toProfessor(row);
}

/** Grants or revokes the professor's permission to enter Esmeraldinha. */
export async function setProfessorAcesso(
  db: Database,
  id: string,
  liberado: boolean,
): Promise<Professor> {
  const result = await db
    .prepare('UPDATE professores SET acesso_liberado = ? WHERE id = ?')
    .run(liberado ? 1 : 0, id);
  if (result.changes === 0) throw new ProfessorNotFoundError(id);
  return (await getProfessor(db, id))!;
}

/**
 * Deletes a professor, removing the row and its encrypted senha.
 *
 * @throws {ProfessorNotFoundError} when `id` matches no professor.
 */
export async function deleteProfessor(db: Database, id: string): Promise<void> {
  const result = await db
    .prepare('DELETE FROM professores WHERE id = ?')
    .run(id);

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
  db: Database,
  encryption: EncryptionPort,
  id: string,
): Promise<ProfessorCredenciais | undefined> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof getProfessorCredenciais>>>(
      'professores.getProfessorCredenciais',
      [id],
    );
  const row = (await db
    .prepare(
      'SELECT login, senha_encrypted, escola FROM professores WHERE id = ?',
    )
    .get(id)) as unknown as CredenciaisRow | undefined;

  if (!row) return undefined;

  const senha = await encryption.decrypt(Buffer.from(row.senha_encrypted));

  return {
    login: row.login,
    senha,
    escola: row.escola,
  };
}
