import { DatabaseSync } from 'node:sqlite';

import { beforeEach, describe, expect, it } from 'vitest';

import { deleteCaderneta } from '../../cadernetas/store';
import { SCHEMA } from '../../professores/db';
import { apagarPrevia, getEstruturaDaFicha, getPrevia, salvarEstruturaDaFicha, salvarPrevia } from '../store';

let db: DatabaseSync;

beforeEach(async () => {
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

it('saves and reads back the structure of a turma', async () => {
  const salva = await salvarEstruturaDaFicha(db, 'prof-1', turma, estrutura);

  expect(salva).toMatchObject(estrutura);
  expect(Number.isNaN(Date.parse(salva.lidaEm))).toBe(false);
  expect(await getEstruturaDaFicha(db, 'prof-1', turma)).toEqual(salva);
});

it('replaces the structure when read again', async () => {
  await salvarEstruturaDaFicha(db, 'prof-1', turma, estrutura);
  await salvarEstruturaDaFicha(db, 'prof-1', turma, { ...estrutura, areas: [] });

  expect((await getEstruturaDaFicha(db, 'prof-1', turma))?.areas).toEqual([]);
});

it('returns null for a turma never read', async () => {
  expect(await getEstruturaDaFicha(db, 'prof-1', 'OUTRA')).toBeNull();
});

describe('prévia', () => {
  function caderneta() {
    db.prepare(
      `INSERT INTO cadernetas (id, professor_id, turma, created_at) VALUES ('cad-1', 'prof-1', ?, '2026-01-01T00:00:00.000Z')`,
    ).run(turma);
    return 'cad-1';
  }

  const previa = {
    areas: [0],
    etapas: [1, 2, 3, 4] as (1 | 2 | 3 | 4)[],
    estudantes: [{ matricula: '101', nome: 'ANA', situacao: 'ATIVO', trechos: [], conceitos: { '0.0': ['RD', 'RD', 'R', 'R'] as ('R' | 'RD' | 'NR' | null)[] } }],
    gerais: [],
    naoResolvidos: [],
    descartadas: [],
    resposta: 'ok',
  };

  it('saves and reads back the prévia of a turma', async () => {
    const id = caderneta();
    const salva = await salvarPrevia(db, id, turma, previa);

    expect(salva).toMatchObject(previa);
    expect(await getPrevia(db, id, turma)).toEqual(salva);
  });

  it('replaces the prévia when saved again', async () => {
    const id = caderneta();
    await salvarPrevia(db, id, turma, previa);
    await salvarPrevia(db, id, turma, { ...previa, resposta: 'nova' });

    expect((await getPrevia(db, id, turma))?.resposta).toBe('nova');
  });

  it('deletes the prévia', async () => {
    const id = caderneta();
    await salvarPrevia(db, id, turma, previa);
    await apagarPrevia(db, id, turma);

    expect(await getPrevia(db, id, turma)).toBeNull();
  });

  it('goes away with its caderneta', async () => {
    const id = caderneta();
    await salvarPrevia(db, id, turma, previa);
    await deleteCaderneta(db, id);

    expect(await getPrevia(db, id, turma)).toBeNull();
  });
});
