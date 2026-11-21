import { DatabaseSync } from 'node:sqlite';

import { beforeEach, expect, it } from 'vitest';

import { SCHEMA } from '../../professores/db';
import { getEstruturaDaFicha, salvarEstruturaDaFicha } from '../store';

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  db.prepare(
    `INSERT INTO professores (id, nome, login, senha_encrypted, escola, created_at)
     VALUES ('prof-1', 'Maria', '111', X'00', 'Escola', '2026-01-01T00:00:00.000Z')`,
  ).run();
});

const turma = 'CRECHE II - CRECHE II - VESPERTINO';
const estrutura = {
  ficha: 'FICHA DESCRITIVA EDUCAÇÃO INFANTIL - CRECHE II - Todas disciplinas',
  areas: [{ indice: 0, titulo: 'O EU, O OUTRO E NÓS (EO)', habilidades: [{ indice: 0, numero: '1°', texto: 'Demonstra cuidado.' }] }],
};

it('saves and reads back the structure of a turma', () => {
  const salva = salvarEstruturaDaFicha(db, 'prof-1', turma, estrutura);

  expect(salva).toMatchObject(estrutura);
  expect(Number.isNaN(Date.parse(salva.lidaEm))).toBe(false);
  expect(getEstruturaDaFicha(db, 'prof-1', turma)).toEqual(salva);
});

it('replaces the structure when read again', () => {
  salvarEstruturaDaFicha(db, 'prof-1', turma, estrutura);
  salvarEstruturaDaFicha(db, 'prof-1', turma, { ...estrutura, areas: [] });

  expect(getEstruturaDaFicha(db, 'prof-1', turma)?.areas).toEqual([]);
});

it('returns null for a turma never read', () => {
  expect(getEstruturaDaFicha(db, 'prof-1', 'OUTRA')).toBeNull();
});
