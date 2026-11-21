import { describe, expect, it } from 'vitest';

import {
  arredondarNota,
  classificar,
  distribuir,
  isClassificacao,
  notaFinalDaClassificacao,
  totalDaEtapa,
  valoresEfetivos,
} from '../classificacao-de-notas';

const quatro = ['OBS', 'TI', 'TG', 'PROVA'].map((nome) => ({ nome, valor: 2.5 }));

describe('distribuir', () => {
  it('splits evenly when it can', () => {
    expect(distribuir(10, quatro)).toEqual([2.5, 2.5, 2.5, 2.5]);
    expect(distribuir(8, quatro)).toEqual([2, 2, 2, 2]);
  });

  it('gives the leftover 0,5 to the first avaliações', () => {
    expect(distribuir(7, quatro)).toEqual([2, 2, 1.5, 1.5]);
    expect(distribuir(5, quatro)).toEqual([1.5, 1.5, 1, 1]);
  });

  it('splits in proportion to each valor and never passes it', () => {
    const desiguais = [
      { nome: 'A', valor: 4 },
      { nome: 'B', valor: 6 },
    ];
    expect(distribuir(10, desiguais)).toEqual([4, 6]);
    expect(distribuir(5, desiguais)).toEqual([2, 3]);
  });

  it('rounds and caps the nota final', () => {
    expect(distribuir(8.3, quatro)).toEqual([2.5, 2, 2, 2]);
    expect(distribuir(12, quatro)).toEqual([2.5, 2.5, 2.5, 2.5]);
    expect(distribuir(-1, quatro)).toEqual([0, 0, 0, 0]);
  });

  it('returns zeros when the etapa has no valor to split into', () => {
    expect(distribuir(10, [{ nome: 'A', valor: 0 }])).toEqual([0]);
    expect(distribuir(10, [])).toEqual([]);
  });
});

describe('valoresEfetivos', () => {
  it('treats a null valor as an equal share of what is left of 10', () => {
    expect(
      valoresEfetivos([
        { nome: 'A', valor: 5 },
        { nome: 'B', valor: null },
        { nome: 'C', valor: null },
      ]),
    ).toEqual([5, 2.5, 2.5]);
  });

  it('gives null valores nothing when the known ones already reach 10', () => {
    expect(
      valoresEfetivos([
        { nome: 'A', valor: 10 },
        { nome: 'B', valor: null },
      ]),
    ).toEqual([10, 0]);
  });

  it('sums into the etapa total', () => {
    expect(totalDaEtapa(quatro)).toBe(10);
    expect(totalDaEtapa([{ nome: 'A', valor: null }])).toBe(10);
  });
});

describe('classificar / notaFinalDaClassificacao', () => {
  it('uses the bands on a 0–10 etapa', () => {
    expect(classificar(10, 10)).toBe('Acima da média');
    expect(classificar(8, 10)).toBe('Acima da média');
    expect(classificar(7.5, 10)).toBe('Na média');
    expect(classificar(6, 10)).toBe('Na média');
    expect(classificar(5.5, 10)).toBe('Abaixo da média');
    expect(classificar(0, 10)).toBe('Abaixo da média');
    expect(notaFinalDaClassificacao('Acima da média', 10)).toBe(10);
    expect(notaFinalDaClassificacao('Na média', 10)).toBe(7);
    expect(notaFinalDaClassificacao('Abaixo da média', 10)).toBe(5);
  });

  it('scales with an etapa that sums to 7,5', () => {
    expect(notaFinalDaClassificacao('Na média', 7.5)).toBe(5);
    expect(notaFinalDaClassificacao('Acima da média', 7.5)).toBe(7.5);
    expect(classificar(6, 7.5)).toBe('Acima da média');
  });
});

describe('arredondarNota / isClassificacao', () => {
  it('rounds to the nearest 0,5 inside the bounds', () => {
    expect(arredondarNota(8.3, 10)).toBe(8.5);
    expect(arredondarNota(8.2, 10)).toBe(8);
    expect(arredondarNota(11, 10)).toBe(10);
    expect(arredondarNota(-2, 10)).toBe(0);
  });

  it('accepts only the three classificações', () => {
    expect(isClassificacao('Na média')).toBe(true);
    expect(isClassificacao('Ótimo')).toBe(false);
    expect(isClassificacao(undefined)).toBe(false);
  });
});
