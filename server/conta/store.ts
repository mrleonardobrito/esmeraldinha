import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { ContaInput } from '../../shared/conta';
import { hashDeSenha, senhaConfere } from './senhas';

/**
 * A conta do auxiliar de ensino como a API a devolve: nunca leva a senha
 * junto, nem o hash dela.
 */
export interface Conta {
  id: string;
  login: string;
  nome: string;
  email: string;
  imagem: string | null;
  /** Requires a completed primeiro acesso before application data is available. */
  precisaTrocarSenha: boolean;
}

/** O nome que a conta ganha ao nascer, até o auxiliar de ensino escrever o dele. */
const NOME_INICIAL = 'Auxiliar de ensino';

interface ContaRow {
  id: string;
  login: string;
  senha_hash: string | null;
  nome: string;
  email: string;
  imagem: string | null;
  supabase_auth_id: string | null;
  supabase_auth_email: string | null;
  auth_setup_complete: number;
}

function toConta(row: ContaRow): Conta {
  return {
    id: row.id,
    login: row.login,
    nome: row.nome,
    email: row.email,
    imagem: row.imagem,
    precisaTrocarSenha: row.supabase_auth_id ? row.auth_setup_complete !== 1 : row.senha_hash === null,
  };
}

function readRow(db: DatabaseSync): ContaRow | undefined {
  return db
    .prepare(
      'SELECT * FROM conta LIMIT 1',
    )
    .get() as unknown as ContaRow | undefined;
}

/** A conta cadastrada, ou `null` enquanto ninguém entrou pela primeira vez. */
export function lerConta(db: DatabaseSync): Conta | null {
  const row = readRow(db);
  return row ? toConta(row) : null;
}

export function lerVinculoDaConta(db: DatabaseSync): { id: string; email: string } | null {
  const row = readRow(db);
  return row?.supabase_auth_id && row.supabase_auth_email
    ? { id: row.supabase_auth_id, email: row.supabase_auth_email }
    : null;
}

export function contaPrecisaVinculo(db: DatabaseSync): boolean {
  const row = readRow(db);
  return Boolean(row?.senha_hash && !row.supabase_auth_id);
}

/** Called only after both the configured remote identity and local proof are verified. */
export function vincularConta(db: DatabaseSync, id: string, authId: string, email: string): Conta {
  db.prepare(`UPDATE conta SET supabase_auth_id = ?, supabase_auth_email = ?, senha_hash = NULL WHERE id = ? AND supabase_auth_id IS NULL`)
    .run(authId, email, id);
  return lerConta(db)!;
}

export function concluirPrimeiroAcesso(db: DatabaseSync, id: string): void {
  db.prepare('UPDATE conta SET auth_setup_complete = 1, senha_hash = NULL WHERE id = ?').run(id);
}

/** Creates the local conta do auxiliar de ensino without a provider binding. */
export function criarConta(db: DatabaseSync, login: string): Conta {
  const id = randomUUID();

  db.prepare(
    `INSERT INTO conta (id, login, senha_hash, nome, email, imagem, created_at)
     VALUES (?, ?, NULL, ?, '', NULL, ?)`,
  ).run(id, login, NOME_INICIAL, new Date().toISOString());

  return {
    id,
    login,
    nome: NOME_INICIAL,
    email: '',
    imagem: null,
    precisaTrocarSenha: true,
  };
}

/** Legacy-only writer retained for migration fixtures; normal senhas live in Auth. */
export async function definirSenha(
  db: DatabaseSync,
  id: string,
  senha: string,
): Promise<void> {
  db.prepare('UPDATE conta SET senha_hash = ? WHERE id = ?').run(
    await hashDeSenha(senha),
    id,
  );
}

/** Verifies the legacy local proof needed once when binding an installation. */
export async function conferirSenhaDefinitiva(
  db: DatabaseSync,
  senha: string,
): Promise<boolean> {
  const row = readRow(db);
  if (!row?.senha_hash) return false;

  return senhaConfere(senha, row.senha_hash);
}

/** Atualiza o perfil: nome, e-mail e foto. O login não se edita. */
export function atualizarConta(
  db: DatabaseSync,
  id: string,
  input: ContaInput,
): Conta {
  db.prepare('UPDATE conta SET nome = ?, email = ?, imagem = ? WHERE id = ?').run(
    input.nome,
    input.email,
    input.imagem ?? null,
    id,
  );

  const row = readRow(db);
  if (!row) throw new Error('A conta do auxiliar de ensino sumiu do banco.');

  return toConta(row);
}
