import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';

import { SCHEMA } from '../../professores/db';
import {
  TurmaNotFoundError,
  getTurma,
  listEstudantes,
  listTurmas,
  replaceEstudantes,
  replaceTurmas,
} from '../store';

const professorId = 'prof-1';

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  db.prepare(
    `INSERT INTO professores (id, nome, login, senha_encrypted, escola, created_at)
     VALUES (?, 'Maria', '111', X'00', 'Escola', '2026-01-01T00:00:00.000Z')`,
  ).run(professorId);
});

describe('replaceTurmas', () => {
  it('guarda as turmas que o portal devolveu, com o turno lido do nome', () => {
    const turmas = replaceTurmas(db, professorId, [
      '9º ANO - 9º ANO A - VESPERTINO',
      'PRÉ-ESCOLA I - PRÉ-ESCOLA I - B - INTEGRAL',
    ]);

    expect(turmas.map((turma) => [turma.nome, turma.turno])).toEqual([
      ['9º ANO - 9º ANO A - VESPERTINO', 'VESPERTINO'],
      ['PRÉ-ESCOLA I - PRÉ-ESCOLA I - B - INTEGRAL', 'INTEGRAL'],
    ]);
  });

  it('deixa o turno nulo quando o portal não o escreveu', () => {
    const [turma] = replaceTurmas(db, professorId, ['9º ANO B']);

    expect(turma.turno).toBeNull();
  });

  it('mantém o id e os estudantes de uma turma que continua no portal', () => {
    const [antes] = replaceTurmas(db, professorId, ['9º ANO - 9º ANO A - MATUTINO']);
    replaceEstudantes(db, antes.id, [
      { matricula: '123', nome: 'Ana', situacao: 'ATIVO', dataMatricula: '01/02/2026' },
    ]);

    const depois = replaceTurmas(db, professorId, [
      '9º ANO - 9º ANO A - MATUTINO',
      '8º ANO - 8º ANO A - MATUTINO',
    ]);
    const mesma = depois.find((turma) => turma.nome === '9º ANO - 9º ANO A - MATUTINO');

    expect(mesma?.id).toBe(antes.id);
    expect(listEstudantes(db, antes.id)).toHaveLength(1);
  });

  it('esquece a turma que sumiu do portal, junto com os estudantes dela', () => {
    const [saindo] = replaceTurmas(db, professorId, ['9º ANO - 9º ANO A - MATUTINO']);
    replaceEstudantes(db, saindo.id, [
      { matricula: '123', nome: 'Ana', situacao: 'ATIVO', dataMatricula: null },
    ]);

    const turmas = replaceTurmas(db, professorId, ['8º ANO - 8º ANO A - MATUTINO']);

    expect(turmas.map((turma) => turma.nome)).toEqual(['8º ANO - 8º ANO A - MATUTINO']);
    expect(listEstudantes(db, saindo.id)).toEqual([]);
  });

  it('não mistura as turmas de professores diferentes', () => {
    db.prepare(
      `INSERT INTO professores (id, nome, login, senha_encrypted, escola, created_at)
       VALUES ('prof-2', 'João', '222', X'00', 'Escola', '2026-01-01T00:00:00.000Z')`,
    ).run();

    replaceTurmas(db, professorId, ['9º ANO - 9º ANO A - MATUTINO']);
    replaceTurmas(db, 'prof-2', ['8º ANO - 8º ANO A - MATUTINO']);

    expect(listTurmas(db, professorId).map((turma) => turma.nome)).toEqual([
      '9º ANO - 9º ANO A - MATUTINO',
    ]);
  });
});

describe('replaceEstudantes', () => {
  it('guarda matrícula, nome, situação e data da matrícula, na ordem do portal', () => {
    const [turma] = replaceTurmas(db, professorId, ['9º ANO - 9º ANO A - MATUTINO']);

    const estudantes = replaceEstudantes(db, turma.id, [
      { matricula: '222', nome: 'Bruno', situacao: 'ATIVO', dataMatricula: '03/02/2026' },
      { matricula: '111', nome: 'Ana', situacao: null, dataMatricula: null },
    ]);

    expect(estudantes).toEqual([
      { matricula: '222', nome: 'Bruno', situacao: 'ATIVO', dataMatricula: '03/02/2026' },
      { matricula: '111', nome: 'Ana', situacao: null, dataMatricula: null },
    ]);
    expect(getTurma(db, turma.id).totalDeEstudantes).toBe(2);
  });

  it('substitui a lista inteira: quem saiu do portal sai daqui', () => {
    const [turma] = replaceTurmas(db, professorId, ['9º ANO - 9º ANO A - MATUTINO']);
    replaceEstudantes(db, turma.id, [
      { matricula: '111', nome: 'Ana', situacao: 'ATIVO', dataMatricula: null },
    ]);

    const estudantes = replaceEstudantes(db, turma.id, [
      { matricula: '222', nome: 'Bruno', situacao: 'ATIVO', dataMatricula: null },
    ]);

    expect(estudantes.map((estudante) => estudante.matricula)).toEqual(['222']);
  });

  it('recusa uma turma que não existe', () => {
    expect(() => replaceEstudantes(db, 'turma-fantasma', [])).toThrow(TurmaNotFoundError);
  });
});
