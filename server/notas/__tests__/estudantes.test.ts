import { describe, expect, it } from 'vitest';

import {
  EstudanteAmbiguoError,
  EstudanteNaoEncontradoError,
  normalizarNome,
  resolverMatricula,
} from '../estudantes';
import { resolverNotas } from '../plano';

const turma = [
  { matricula: '111', nome: 'JOSÉ DA SILVA' },
  { matricula: '222', nome: 'MARIA CLARA DOS SANTOS' },
  { matricula: '333', nome: 'ANA BEATRIZ LIMA' },
];

describe('normalizarNome', () => {
  it('ignora acento, caixa e espaço sobrando', () => {
    expect(normalizarNome('  José   da SILVA ')).toBe('jose da silva');
  });
});

describe('resolverMatricula', () => {
  it('casa o nome inteiro como o professor o escreveu', () => {
    expect(resolverMatricula('josé da silva', turma)).toBe('111');
  });

  it('aceita o nome parcial quando ele serve a um único estudante', () => {
    expect(resolverMatricula('Maria Clara', turma)).toBe('222');
  });

  it('recusa o parcial que serve a mais de um estudante', () => {
    const irmas = [
      { matricula: '444', nome: 'ANA BEATRIZ LIMA' },
      { matricula: '555', nome: 'ANA BEATRIZ COSTA' },
    ];

    expect(() => resolverMatricula('Ana Beatriz', irmas)).toThrow(EstudanteAmbiguoError);
  });

  it('não casa um pedaço de palavra', () => {
    expect(() => resolverMatricula('Ana', [{ matricula: '666', nome: 'JOANA DARC' }])).toThrow(
      EstudanteNaoEncontradoError,
    );
  });

  it('recusa quem não é da turma', () => {
    expect(() => resolverMatricula('Pedro Alves', turma)).toThrow(
      EstudanteNaoEncontradoError,
    );
  });

  it('recusa um nome vazio', () => {
    expect(() => resolverMatricula('   ', turma)).toThrow(EstudanteNaoEncontradoError);
  });
});

describe('resolverNotas', () => {
  it('troca o nome do estudante pela matrícula do portal', () => {
    expect(
      resolverNotas([{ estudante: 'josé da silva', valor: 8.5 }], 'PROVA 1', turma),
    ).toEqual([{ matricula: '111', avaliacao: 'PROVA 1', valor: 8.5 }]);
  });

  it('não lança nenhuma nota quando um dos nomes não é da turma', () => {
    expect(() =>
      resolverNotas(
        [
          { estudante: 'José da Silva', valor: 8 },
          { estudante: 'Pedro Alves', valor: 9 },
        ],
        'PROVA 1',
        turma,
      ),
    ).toThrow(EstudanteNaoEncontradoError);
  });
});
