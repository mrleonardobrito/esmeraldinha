import { DatabaseSync } from 'node:sqlite';

import { beforeEach, describe, expect, it } from 'vitest';

import { MissingColumnError, parseCodigosCR } from '../csv';
import { findCodigoCR, listCodigosCR, replaceCodigosCR } from '../store';

const HEADER = 'codigo,componente,texto,vigencia_status';

describe('parseCodigosCR', () => {
  it('keeps only the codigo and the texto', () => {
    const csv = `${HEADER}\nEF01LP01,ef-comp-lp,Reconhecer que textos são lidos da esquerda para a direita.,vigente\n`;

    expect(parseCodigosCR(csv)).toEqual([
      {
        codigo: 'EF01LP01',
        texto: 'Reconhecer que textos são lidos da esquerda para a direita.',
      },
    ]);
  });

  it('reads a texto that carries commas and escaped quotes', () => {
    const csv = `${HEADER}\nEF01LP02,ef-comp-lp,"Escrever, por ditado, palavras ""de forma alfabética"".",vigente\n`;

    expect(parseCodigosCR(csv)[0].texto).toBe(
      'Escrever, por ditado, palavras "de forma alfabética".',
    );
  });

  it('drops rows without a codigo or a texto', () => {
    const csv = `${HEADER}\nEF01LP01,ef-comp-lp,Reconhecer.,vigente\n,ef-comp-lp,Sem código.,vigente\nEF01LP03,ef-comp-lp,,vigente\n`;

    expect(parseCodigosCR(csv).map((c) => c.codigo)).toEqual(['EF01LP01']);
  });

  it('refuses a planilha missing a column the catálogo needs', () => {
    expect(() => parseCodigosCR('codigo,componente\nEF01LP01,ef-comp-lp\n')).toThrow(
      MissingColumnError,
    );
  });
});

describe('catálogo de códigos CR', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(
      'CREATE TABLE codigos_cr (codigo TEXT PRIMARY KEY, texto TEXT NOT NULL);',
    );
  });

  it('lists what was imported, in codigo order', () => {
    replaceCodigosCR(db, [
      { codigo: 'EF02MA01', texto: 'Segundo.' },
      { codigo: 'EF01LP01', texto: 'Primeiro.' },
    ]);

    expect(listCodigosCR(db).map((c) => c.codigo)).toEqual([
      'EF01LP01',
      'EF02MA01',
    ]);
  });

  it('replaces the catálogo instead of merging into it', () => {
    replaceCodigosCR(db, [{ codigo: 'EF01LP01', texto: 'Antigo.' }]);
    replaceCodigosCR(db, [{ codigo: 'EF02MA01', texto: 'Novo.' }]);

    expect(listCodigosCR(db)).toEqual([{ codigo: 'EF02MA01', texto: 'Novo.' }]);
  });

  it('finds one código CR, and nothing for one it does not carry', () => {
    replaceCodigosCR(db, [{ codigo: 'EF01LP01', texto: 'Reconhecer.' }]);

    expect(findCodigoCR(db, 'EF01LP01')?.texto).toBe('Reconhecer.');
    expect(findCodigoCR(db, 'EF09MA99')).toBeNull();
  });

  it('leaves the catálogo untouched when an import fails halfway', () => {
    replaceCodigosCR(db, [{ codigo: 'EF01LP01', texto: 'Antigo.' }]);

    expect(() =>
      replaceCodigosCR(db, [
        { codigo: 'EF02MA01', texto: 'Novo.' },
        { codigo: 'EF02MA01', texto: 'Repetido.' },
      ]),
    ).toThrow();

    expect(listCodigosCR(db)).toEqual([{ codigo: 'EF01LP01', texto: 'Antigo.' }]);
  });
});
