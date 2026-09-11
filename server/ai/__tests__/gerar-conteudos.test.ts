import { describe, expect, it, vi } from 'vitest';

import { EnvioInvalidoError } from '../errors';
import {
  anoDaTurma,
  codigosDoAno,
  gerarConteudos,
  montarCodigoCR,
  type GerarConteudosInput,
} from '../gerar-conteudos';

const codigosCR = [
  { codigo: 'EF03LP18', texto: 'Ler e compreender fábulas.' },
  { codigo: 'EF15LP01', texto: 'Identificar a função social de textos.' },
  { codigo: 'EF35LP03', texto: 'Identificar a ideia central do texto.' },
  { codigo: 'EF12LP01', texto: 'Ler palavras novas.' },
  { codigo: 'EF05MA01', texto: 'Ler números naturais.' },
];

const base: Omit<GerarConteudosInput, 'complete'> = {
  turma: '3º ANO - 3º ANO A - INTEGRAL',
  etapa: 'III ETAPA',
  mes: 'Setembro',
  aulasPendentes: [
    { data: '16/09/2026', ordem: 1 },
    { data: '23/09/2026', ordem: 1 },
  ],
  aulasPreenchidas: [
    {
      etapa: 'III ETAPA',
      mes: 'Setembro',
      data: '09/09/2026',
      ordem: 1,
      codigoCR: '(EF03LP18) Ler e compreender fábulas.',
      desenvolvimento: 'Reescrita coletiva do final da fábula.',
      ferramentas: 'Caderno, quadro',
    },
  ],
  referencias: [],
  rascunhos: [],
  mensagens: [{ papel: 'auxiliar', texto: 'Fechamos fábulas e passamos para produção de texto.' }],
  codigosCR,
};

const resposta = {
  resposta: 'Escrevi as duas aulas.',
  aulas: [
    {
      data: '16/09/2026',
      ordem: 1,
      codigoCR: 'EF03LP18',
      desenvolvimento: 'Retomada das fábulas.',
      ferramentas: 'Livro didático',
    },
    {
      data: '23/09/2026',
      ordem: 1,
      codigoCR: 'EF03LP18, EF35LP03',
      desenvolvimento: 'Produção de texto.',
      ferramentas: 'Caderno',
    },
  ],
};

describe('anoDaTurma', () => {
  it('lê o ano do nome que o portal escreve', () => {
    expect(anoDaTurma('3º ANO - 3º ANO A - INTEGRAL')).toBe(3);
    expect(anoDaTurma('1º ANO - 1º ANO B - MATUTINO')).toBe(1);
  });

  it('não tem ano para turmas fora do fundamental', () => {
    expect(anoDaTurma('PRÉ-ESCOLA II - PRÉ-ESCOLA II - C - INTEGRAL')).toBeNull();
  });
});

describe('codigosDoAno', () => {
  it('fica só com os códigos do ano e das faixas que o incluem', () => {
    expect(codigosDoAno(codigosCR, 3).map((c) => c.codigo)).toEqual([
      'EF03LP18',
      'EF15LP01',
      'EF35LP03',
    ]);
  });

  it('não oferece nada quando a turma não tem ano', () => {
    expect(codigosDoAno(codigosCR, null)).toEqual([]);
  });
});

describe('montarCodigoCR', () => {
  const buscar = (codigo: string) => codigosCR.find((c) => c.codigo === codigo) ?? null;

  it('numera uma habilidade por linha, com o código e o texto oficial ao lado', () => {
    expect(montarCodigoCR('EF03LP18, ef35lp03', buscar)).toBe(
      '1. (EF03LP18) Ler e compreender fábulas.\n2. (EF35LP03) Identificar a ideia central do texto.',
    );
  });

  it('deixa só o código quando ele não está no catálogo, e não repete o repetido', () => {
    expect(montarCodigoCR('EF03LP18, EF09XX99, EF03LP18', buscar)).toBe(
      '1. (EF03LP18) Ler e compreender fábulas.\n2. (EF09XX99)',
    );
  });

  it('devolve o campo como veio quando não há código nenhum', () => {
    expect(montarCodigoCR('  Leitura de fábulas ', buscar)).toBe('Leitura de fábulas');
    expect(montarCodigoCR('', buscar)).toBe('');
  });
});

describe('gerarConteudos', () => {
  it('devolve um rascunho por aula pendente, com o código CR resolvido no catálogo', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify(resposta));

    const gerados = await gerarConteudos({ ...base, complete });

    expect(gerados.resposta).toBe('Escrevi as duas aulas.');
    expect(gerados.aulas).toEqual([
      {
        data: '16/09/2026',
        ordem: 1,
        codigoCR: '1. (EF03LP18) Ler e compreender fábulas.',
        desenvolvimento: 'Retomada das fábulas.',
        ferramentas: 'Livro didático',
      },
      {
        data: '23/09/2026',
        ordem: 1,
        codigoCR:
          '1. (EF03LP18) Ler e compreender fábulas.\n2. (EF35LP03) Identificar a ideia central do texto.',
        desenvolvimento: 'Produção de texto.',
        ferramentas: 'Caderno',
      },
    ]);
  });

  it('leva ao agente o escopo, as aulas pendentes, as já preenchidas e só os códigos do ano', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify(resposta));

    await gerarConteudos({ ...base, complete });

    const { system, content } = complete.mock.calls[0][0];
    expect(system).toContain('o mês de Setembro da III ETAPA');
    expect(system).toContain('16/09/2026 (ordem 1)');
    expect(system).toContain('Reescrita coletiva do final da fábula.');
    expect(system).toContain('EF03LP18');
    expect(system).toContain('EF15LP01');
    expect(system).not.toContain('EF05MA01');
    expect(system).not.toContain('EF12LP01');
    expect(content[0]).toEqual({
      type: 'text',
      text: expect.stringContaining('Auxiliar de ensino: Fechamos fábulas'),
    });
  });

  it('mantém o rascunho anterior de uma aula que o agente deixou de fora', async () => {
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({ resposta: 'Mudei só a de 23/09.', aulas: [resposta.aulas[1]] }),
    );

    const gerados = await gerarConteudos({
      ...base,
      rascunhos: [
        {
          data: '16/09/2026',
          ordem: 1,
          codigoCR: '(EF03LP18) Ler e compreender fábulas.',
          desenvolvimento: 'Rascunho antigo da aula de 16/09.',
          ferramentas: 'Livro',
        },
      ],
      complete,
    });

    expect(gerados.aulas.map((aula) => aula.desenvolvimento)).toEqual([
      'Rascunho antigo da aula de 16/09.',
      'Produção de texto.',
    ]);
  });

  it('ignora uma aula que o agente inventou fora das pendentes', async () => {
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({
        resposta: '',
        aulas: [
          ...resposta.aulas,
          { data: '30/09/2026', ordem: 1, codigoCR: '', desenvolvimento: 'x', ferramentas: '' },
        ],
      }),
    );

    const gerados = await gerarConteudos({ ...base, complete });

    expect(gerados.aulas.map((aula) => aula.data)).toEqual(['16/09/2026', '23/09/2026']);
  });

  it('recusa uma resposta fora do formato', async () => {
    const complete = vi.fn().mockResolvedValue('{"resposta": 1}');

    await expect(gerarConteudos({ ...base, complete })).rejects.toBeInstanceOf(
      EnvioInvalidoError,
    );
  });

  it('só pede a leitura de PDF quando há um PDF anexado', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify(resposta));

    await gerarConteudos({
      ...base,
      arquivos: [
        { filename: 'plano.pdf', mimeType: 'application/pdf', data: new Uint8Array([1]) },
      ],
      complete,
    });

    expect(complete.mock.calls[0][0].parsePdf).toBe(true);
    expect(complete.mock.calls[0][0].content[1]).toMatchObject({ type: 'file' });
  });
});
