import { describe, expect, it } from 'vitest';

import {
  EstudanteAmbiguoError,
  EstudanteNaoEncontradoError,
  normalizarNome,
  resolverMatricula,
  resolverMatriculaDaNota,
} from '../estudantes';
import { resolverNotas, resolverNotasParaPreview } from '../plano';

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

describe('resolverMatriculaDaNota', () => {
  it('usa a matrícula do material e ignora o erro no nome', () => {
    // O portal chaveia por matrícula: "JOSE DA SILVAA" é a mesma pessoa.
    expect(
      resolverMatriculaDaNota({ matricula: '111', estudante: 'JOSE DA SILVAA' }, turma),
    ).toBe('111');
  });

  it('ignora pontuação e espaço na matrícula', () => {
    expect(
      resolverMatriculaDaNota({ matricula: ' 2-2-2 ', estudante: 'seja quem for' }, turma),
    ).toBe('222');
  });

  it('cai no nome quando o material não traz matrícula', () => {
    expect(resolverMatriculaDaNota({ matricula: '', estudante: 'Maria Clara' }, turma)).toBe(
      '222',
    );
  });

  it('cai no nome quando a matrícula não é de ninguém da turma', () => {
    // Uma exportação com a numeração de outro ano erra a matrícula e acerta o
    // nome; recusar aí seria perder a nota que o material identificava bem.
    expect(
      resolverMatriculaDaNota({ matricula: '999', estudante: 'José da Silva' }, turma),
    ).toBe('111');
  });

  it('diz que a matrícula também falhou quando nem ela nem o nome casam', () => {
    expect(() =>
      resolverMatriculaDaNota({ matricula: '999', estudante: 'Pedro Alves' }, turma),
    ).toThrow(/Nem a matrícula 999 nem o nome "Pedro Alves"/);
  });
});

describe('resolverNotas', () => {
  it('prefere a matrícula ao nome', () => {
    expect(
      resolverNotas(
        [
          {
            estudante: 'ANA BEATRIS LIMAA',
            matricula: '333',
            notas: [{ avaliacao: 'PROVA 1', valor: 7 }],
          },
        ],
        turma,
      ),
    ).toEqual([{ matricula: '333', avaliacao: 'PROVA 1', valor: 7 }]);
  });


  it('troca o nome do estudante pela matrícula do portal', () => {
    expect(
      resolverNotas(
        [
          {
            estudante: 'josé da silva',
            matricula: '',
            notas: [{ avaliacao: 'PROVA 1', valor: 8.5 }],
          },
        ],
        turma,
      ),
    ).toEqual([{ matricula: '111', avaliacao: 'PROVA 1', valor: 8.5 }]);
  });

  it('não lança nenhuma nota quando um dos nomes não é da turma', () => {
    expect(() =>
      resolverNotas(
        [
          {
            estudante: 'José da Silva',
            matricula: '',
            notas: [{ avaliacao: 'PROVA 1', valor: 8 }],
          },
          {
            estudante: 'Pedro Alves',
            matricula: '',
            notas: [{ avaliacao: 'PROVA 1', valor: 9 }],
          },
        ],
        turma,
      ),
    ).toThrow(EstudanteNaoEncontradoError);
  });
});

describe('resolverNotasParaPreview', () => {
  it('devolve itens prontos e falhas com candidatos quando ambíguo', () => {
    const turmaComAmbiguos = [
      { matricula: '12816', nome: 'RAFAEL EDUARDO BARROS' },
      { matricula: '12821', nome: 'RAFAEL EDUARDO BASTOS' },
      { matricula: '12801', nome: 'ANA BEATRIZ LIMA' },
    ];

    const resultado = resolverNotasParaPreview(
      [
        {
          estudante: 'Ana Beatriz Lima',
          matricula: '',
          notas: [
            { avaliacao: 'PROVA 1', valor: 9.0 },
            { avaliacao: 'TRABALHO', valor: 8.0 },
          ],
        },
        {
          estudante: 'Rafael Eduardo',
          matricula: '',
          notas: [{ avaliacao: 'PROVA 1', valor: 8.5 }],
        },
        {
          estudante: 'Carlos Daniel',
          matricula: '',
          notas: [{ avaliacao: 'PROVA 1', valor: 7.0 }],
        },
      ],
      turmaComAmbiguos,
    );

    expect(resultado[0]).toEqual({
      status: 'pronta',
      notas: [
        { matricula: '12801', avaliacao: 'PROVA 1', valor: 9.0 },
        { matricula: '12801', avaliacao: 'TRABALHO', valor: 8.0 },
      ],
    });

    expect(resultado[1].status).toBe('falha');
    if (resultado[1].status === 'falha') {
      expect(resultado[1].candidatos).toEqual(['12816', '12821']);
    }

    expect(resultado[2].status).toBe('falha');
    if (resultado[2].status === 'falha') {
      expect(resultado[2].candidatos).toBeUndefined();
    }
  });
});
