import { describe, expect, it } from 'vitest';

import {
  ajustarPrevia,
  alterarConceito,
  aplicarNaFicha,
  contarExcecoes,
  fichaInicial,
  normalizarLinha,
} from '../ficha-de-desempenho';

const todas = [1, 2, 3, 4] as const;

describe('alterarConceito', () => {
  it('lowers earlier etapas', () => {
    expect(alterarConceito(['R', 'R', 'R', 'R'], 2, 'RD', todas)).toEqual(['RD', 'RD', 'R', 'R']);
  });

  it('raises later etapas', () => {
    expect(alterarConceito(['NR', 'NR', 'NR', 'NR'], 2, 'R', todas)).toEqual(['NR', 'R', 'R', 'R']);
  });

  it('ignores etapas outside the run', () => {
    expect(alterarConceito([null, 'R', 'R', null], 3, 'NR', [2, 3])).toEqual([null, 'NR', 'NR', null]);
  });
});

describe('normalizarLinha', () => {
  it('raises each chosen etapa to at least the previous one', () => {
    expect(normalizarLinha(['R', 'NR', 'RD', 'R'], todas)).toEqual(['R', 'R', 'R', 'R']);
    expect(normalizarLinha([null, 'RD', null, 'NR'], [2, 4])).toEqual([null, 'RD', null, 'RD']);
  });
});

const areas = [
  { indice: 0, titulo: 'LP', habilidades: [{ indice: 0, numero: '1°', texto: 'a' }, { indice: 1, numero: '2°', texto: 'b' }] },
  { indice: 2, titulo: 'MAT', habilidades: [{ indice: 0, numero: '1°', texto: 'c' }] },
];

describe('fichaInicial', () => {
  it('applies an exceção on its etapas only', () => {
    const ficha = fichaInicial(areas, todas, [{ area: 0, habilidade: 1, conceito: 'RD', etapas: [1, 2] }]);

    expect(ficha).toEqual({
      '0.0': ['R', 'R', 'R', 'R'],
      '0.1': ['RD', 'RD', 'R', 'R'],
      '2.0': ['R', 'R', 'R', 'R'],
    });
  });

  it('applies a later-etapa exceção by lowering the earlier etapas', () => {
    const ficha = fichaInicial(areas, todas, [{ area: 0, habilidade: 0, conceito: 'NR', etapas: [3] }]);

    expect(ficha['0.0']).toEqual(['NR', 'NR', 'NR', 'R']);
  });

  it('leaves etapas outside the run empty', () => {
    expect(fichaInicial(areas, [2, 3], [])['0.0']).toEqual([null, 'R', 'R', null]);
  });
});

describe('aplicarNaFicha', () => {
  it('only lowers conceitos, never raises them', () => {
    const ficha = { '0.0': ['NR', 'NR', 'R', 'R'] as const, '0.1': ['R', 'R', 'R', 'R'] as const };

    const depois = aplicarNaFicha(
      { '0.0': [...ficha['0.0']], '0.1': [...ficha['0.1']] },
      [{ area: 0, habilidade: 0, conceito: 'RD', etapas: [1, 2, 3, 4] }, { area: 0, habilidade: 1, conceito: 'RD', etapas: [1] }],
      todas,
    );

    expect(depois['0.0']).toEqual(['NR', 'NR', 'RD', 'RD']);
    expect(depois['0.1']).toEqual(['RD', 'R', 'R', 'R']);
  });
});

describe('contarExcecoes', () => {
  it('counts RD and NR cells', () => {
    expect(contarExcecoes({ '0.0': ['RD', 'RD', 'R', 'R'], '0.1': [null, 'NR', 'R', null] })).toBe(3);
  });
});

describe('ajustarPrevia', () => {
  const previa = {
    areas: [0],
    etapas: [1, 2, 3, 4] as (1 | 2 | 3 | 4)[],
    estudantes: [{ matricula: '101', nome: 'ANA', situacao: 'ATIVO', trechos: [], conceitos: {
      '0.0': ['NR', 'RD', 'RD', 'R'], '0.1': ['R', 'R', 'R', 'R'],
    } as Record<string, ('R' | 'RD' | 'NR' | null)[]> }],
    gerais: [], naoResolvidos: [], descartadas: [], resposta: '', atualizadaEm: 'v1',
  };

  it('drops the rows of an área that was unchecked', () => {
    const ajustada = ajustarPrevia(previa, areas, [2], [1, 2, 3, 4]);

    expect(ajustada.areas).toEqual([2]);
    expect(Object.keys(ajustada.estudantes[0].conceitos)).toEqual(['2.0']);
  });

  it('adds a checked área with R in every etapa', () => {
    const ajustada = ajustarPrevia(previa, areas, [0, 2], [1, 2, 3, 4]);

    expect(ajustada.estudantes[0].conceitos['0.0']).toEqual(['NR', 'RD', 'RD', 'R']);
    expect(ajustada.estudantes[0].conceitos['2.0']).toEqual(['R', 'R', 'R', 'R']);
  });

  it('empties the column of an unchecked etapa', () => {
    const ajustada = ajustarPrevia(previa, areas, [0], [1, 4]);

    expect(ajustada.etapas).toEqual([1, 4]);
    expect(ajustada.estudantes[0].conceitos['0.0']).toEqual(['NR', null, null, 'R']);
  });

  it('fills a newly checked etapa from the etapa before it, so nothing decreases', () => {
    const semIII = ajustarPrevia(previa, areas, [0], [1, 2, 4]);
    const comIII = ajustarPrevia(semIII, areas, [0], [1, 2, 3, 4]);

    expect(comIII.estudantes[0].conceitos['0.0']).toEqual(['NR', 'RD', 'RD', 'R']);
  });

  it('fills a newly checked first etapa from the one after it', () => {
    const soIII = ajustarPrevia(previa, areas, [0], [3]);
    const comI = ajustarPrevia(soIII, areas, [0], [1, 3]);

    expect(comI.estudantes[0].conceitos['0.0']).toEqual(['RD', null, 'RD', null]);
  });
});
