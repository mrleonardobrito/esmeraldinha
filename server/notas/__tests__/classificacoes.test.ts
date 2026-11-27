import { DatabaseSync } from 'node:sqlite';

import { beforeEach, describe, expect, it } from 'vitest';

import { SCHEMA } from '../../professores/db';
import {
  getClassificacaoPadrao,
  listClassificacoes,
  salvarClassificacoes,
  setClassificacaoPadrao,
} from '../classificacoes';

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  db.prepare(
    `INSERT INTO professores (id, nome, login, senha_encrypted, escola, created_at)
     VALUES ('prof-1', 'Maria', '111', X'00', 'Escola', '2026-01-01T00:00:00.000Z')`,
  ).run();
});

describe('classificação padrão', () => {
  it('starts at Acima da média and is kept per turma', () => {
    expect(getClassificacaoPadrao(db, 'prof-1', 'T')).toBe('Acima da média');

    setClassificacaoPadrao(db, 'prof-1', 'T', 'Na média');

    expect(getClassificacaoPadrao(db, 'prof-1', 'T')).toBe('Na média');
    expect(getClassificacaoPadrao(db, 'prof-1', 'U')).toBe('Acima da média');
  });

  it('falls back to Acima da média when the stored value is not a classificação', () => {
    db.prepare(
      `INSERT INTO classificacoes_padrao (professor_id, turma, classificacao) VALUES ('prof-1', 'T', 'Ótimo')`,
    ).run();

    expect(getClassificacaoPadrao(db, 'prof-1', 'T')).toBe('Acima da média');
  });
});

describe('classificações dos estudantes', () => {
  it('upserts by matrícula and keeps the others', () => {
    salvarClassificacoes(db, 'prof-1', 'T', [
      { matricula: '1', classificacao: 'Abaixo da média' },
      { matricula: '2', classificacao: 'Na média' },
    ]);
    salvarClassificacoes(db, 'prof-1', 'T', [{ matricula: '1', classificacao: 'Na média' }]);

    expect(listClassificacoes(db, 'prof-1', 'T')).toEqual({
      '1': 'Na média',
      '2': 'Na média',
    });
    expect(listClassificacoes(db, 'prof-1', 'U')).toEqual({});
  });

  it('keeps only the classificações that differ from the padrão, so the padrão still moves the rest', () => {
    setClassificacaoPadrao(db, 'prof-1', 'T', 'Acima da média');
    salvarClassificacoes(db, 'prof-1', 'T', [{ matricula: '1', classificacao: 'Abaixo da média' }]);

    salvarClassificacoes(db, 'prof-1', 'T', [
      { matricula: '1', classificacao: 'Acima da média' },
      { matricula: '2', classificacao: 'Acima da média' },
      { matricula: '3', classificacao: 'Na média' },
    ]);

    expect(listClassificacoes(db, 'prof-1', 'T')).toEqual({ '3': 'Na média' });
  });

  it('goes away with the professor', () => {
    setClassificacaoPadrao(db, 'prof-1', 'T', 'Na média');
    salvarClassificacoes(db, 'prof-1', 'T', [{ matricula: '1', classificacao: 'Na média' }]);

    db.prepare("DELETE FROM professores WHERE id = 'prof-1'").run();

    expect(db.prepare('SELECT COUNT(*) AS n FROM classificacoes_padrao').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM classificacoes_dos_estudantes').get()).toEqual({ n: 0 });
  });
});
