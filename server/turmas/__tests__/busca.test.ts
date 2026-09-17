import { describe, expect, it } from 'vitest';

import type { ConteudoCatalogo } from '../../scrape/types';
import { etapasDaTurma, periodoLetivoDaTurma, turmasComPeriodo, turmasDoCatalogo } from '../busca';

/**
 * Uma professora com turmas do fundamental em "2026" e da EJA em "2026 EJA".
 * Os dois períodos têm etapas de mesmo nome.
 */
const catalogo: ConteudoCatalogo = {
  etapas: [
    {
      nome: 'I ETAPA',
      periodoLetivo: '2026 EJA',
      turmas: ['EJA - 1ª FASE - NOTURNO'],
      meses: ['FEVEREIRO'],
    },
    {
      nome: 'II ETAPA',
      periodoLetivo: '2026 EJA',
      turmas: ['EJA - 1ª FASE - NOTURNO'],
      meses: ['MAIO'],
    },
    {
      nome: 'I ETAPA',
      periodoLetivo: '2026',
      turmas: ['3º ANO - 3º ANO A - MATUTINO', '5º ANO - 5º ANO B - VESPERTINO'],
      meses: ['FEVEREIRO', 'MARÇO'],
    },
    {
      nome: 'II ETAPA',
      periodoLetivo: '2026',
      turmas: ['3º ANO - 3º ANO A - MATUTINO'],
      meses: ['ABRIL'],
    },
  ],
};

describe('turmasDoCatalogo', () => {
  it('junta as turmas de todos os períodos letivos, sem repetir', () => {
    expect(turmasDoCatalogo(catalogo)).toEqual([
      'EJA - 1ª FASE - NOTURNO',
      '3º ANO - 3º ANO A - MATUTINO',
      '5º ANO - 5º ANO B - VESPERTINO',
    ]);
  });

  it('diz em qual período letivo cada turma mora', () => {
    expect(turmasComPeriodo(catalogo)).toEqual([
      { nome: 'EJA - 1ª FASE - NOTURNO', periodoLetivo: '2026 EJA' },
      { nome: '3º ANO - 3º ANO A - MATUTINO', periodoLetivo: '2026' },
      { nome: '5º ANO - 5º ANO B - VESPERTINO', periodoLetivo: '2026' },
    ]);
  });
});

describe('periodoLetivoDaTurma', () => {
  it('acha o período pela turma', () => {
    expect(periodoLetivoDaTurma(catalogo, 'EJA - 1ª FASE - NOTURNO')).toBe('2026 EJA');
    expect(periodoLetivoDaTurma(catalogo, '5º ANO - 5º ANO B - VESPERTINO')).toBe('2026');
  });

  it('é undefined para uma turma que não é do professor', () => {
    expect(periodoLetivoDaTurma(catalogo, '9º ANO - 9º ANO A - MATUTINO')).toBeUndefined();
  });
});

describe('etapasDaTurma', () => {
  it('só traz as etapas do período letivo da turma, mesmo com nomes iguais no outro', () => {
    const etapas = etapasDaTurma(catalogo, '5º ANO - 5º ANO B - VESPERTINO');

    expect(etapas.map((etapa) => [etapa.nome, etapa.periodoLetivo])).toEqual([
      ['I ETAPA', '2026'],
      ['II ETAPA', '2026'],
    ]);
  });

  it('não traz etapa nenhuma para uma turma desconhecida', () => {
    expect(etapasDaTurma(catalogo, 'nada')).toEqual([]);
  });
});
