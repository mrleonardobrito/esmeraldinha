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
  /**
   * Verdadeiro enquanto a senha em uso ainda é a temporária do ambiente. O
   * primeiro acesso não deixa o auxiliar de ensino passar daqui.
   */
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
}

function toConta(row: ContaRow): Conta {
  return {
    id: row.id,
    login: row.login,
    nome: row.nome,
    email: row.email,
    imagem: row.imagem,
    precisaTrocarSenha: row.senha_hash === null,
  };
}

function readRow(db: DatabaseSync): ContaRow | undefined {
  return db
    .prepare(
      'SELECT id, login, senha_hash, nome, email, imagem FROM conta LIMIT 1',
    )
    .get() as unknown as ContaRow | undefined;
}

/** A conta cadastrada, ou `null` enquanto ninguém entrou pela primeira vez. */
export function lerConta(db: DatabaseSync): Conta | null {
  const row = readRow(db);
  return row ? toConta(row) : null;
}

/**
 * Cria a conta do auxiliar de ensino sem senha definitiva — é o que o
 * primeiro acesso deixa para trás enquanto a senha temporária ainda vale.
 */
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

/** Grava a senha definitiva, encerrando o primeiro acesso. */
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

/**
 * Confere a senha definitiva da conta. Devolve `false` enquanto ela não
 * existe: nesse caso quem manda é a senha temporária do ambiente.
 */
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
