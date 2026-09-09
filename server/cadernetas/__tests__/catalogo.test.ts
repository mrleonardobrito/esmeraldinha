import { describe, expect, it } from 'vitest';

import { comAvaliacoesDoBanco } from '../catalogo';
import type { AvaliacaoDaTurma } from '../store';
import type { ConteudoCatalogo } from '../../scrape/types';

const catalogo: ConteudoCatalogo = {
  etapas: [
    {
      nome: 'I ETAPA',
      turmas: ['1º ANO D', '3º ANO A'],
      meses: ['FEVEREIRO', 'MARÇO'],
    },
    { nome: 'II ETAPA', turmas: ['3º ANO A'], meses: ['MAIO'] },
  ],
};

const avaliacoes: AvaliacaoDaTurma[] = [
  {
    turma: '3º ANO A',
    etapa: 'I ETAPA',
    disciplina: 'CIÊNCIAS',
    nome: 'OBSERVAÇÃO',
    valor: 2.5,
  },
  {
    turma: '3º ANO A',
    etapa: 'I ETAPA',
    disciplina: 'CIÊNCIAS',
    nome: 'AVALIAÇÃO/PROVA',
    valor: 2.5,
  },
  {
    turma: '3º ANO A',
    etapa: 'I ETAPA',
    disciplina: 'MATEMÁTICA',
    nome: 'OBSERVAÇÃO',
    valor: 2.5,
  },
];

describe('comAvaliacoesDoBanco', () => {
  it('põe as avaliações na turma a que pertencem, não na etapa', () => {
    const { etapas } = comAvaliacoesDoBanco(catalogo, avaliacoes);

    expect(etapas[0].disciplinasPorTurma).toEqual([
      {
        turma: '3º ANO A',
        disciplinas: [
          {
            nome: 'CIÊNCIAS',
            avaliacoes: [
              { nome: 'OBSERVAÇÃO', valor: 2.5 },
              { nome: 'AVALIAÇÃO/PROVA', valor: 2.5 },
            ],
          },
          { nome: 'MATEMÁTICA', avaliacoes: [{ nome: 'OBSERVAÇÃO', valor: 2.5 }] },
        ],
      },
    ]);
  });

  it('deixa de fora a turma sem avaliação, em vez de esvaziar a etapa inteira', () => {
    const { etapas } = comAvaliacoesDoBanco(catalogo, avaliacoes);

    // O 1º ANO D não tem avaliação cadastrada, e é a primeira turma da etapa:
    // ler só a primeira era o que apagava as avaliações do 3º ANO A.
    expect(etapas[0].disciplinasPorTurma?.map((d) => d.turma)).toEqual(['3º ANO A']);
    expect(etapas[0].turmas).toEqual(['1º ANO D', '3º ANO A']);
  });

  it('não empresta a uma etapa as avaliações de outra', () => {
    const { etapas } = comAvaliacoesDoBanco(catalogo, avaliacoes);

    expect(etapas[1].disciplinasPorTurma).toEqual([]);
  });
});
