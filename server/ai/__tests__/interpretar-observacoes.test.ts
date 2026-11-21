import { describe, expect, it, vi } from 'vitest';

import { EnvioInvalidoError } from '../errors';
import { interpretarObservacoes } from '../interpretar-observacoes';

const areas = [
  {
    indice: 0,
    titulo: 'O EU, O OUTRO E NÓS (EO)',
    habilidades: [
      { indice: 0, numero: '1°', texto: 'Demonstra cuidado.' },
      { indice: 1, numero: '2°', texto: 'Comunica-se com adultos.' },
    ],
  },
  {
    indice: 3,
    titulo: 'ESCUTA, FALA, PENSAMENTO E IMAGINAÇÃO (EF)',
    habilidades: [{ indice: 0, numero: '1°', texto: 'Dialoga com crianças.' }],
  },
];

const estudantes = [
  { matricula: '10315', nome: 'ANA RUTHE IZABELLY DA SILVA' },
  { matricula: '10316', nome: 'JOÃO PEDRO SANTOS' },
  { matricula: '10317', nome: 'JOÃO MIGUEL LIMA' },
];

function agente(resposta: unknown) {
  return vi.fn().mockResolvedValue(JSON.stringify(resposta));
}

const base = { turma: 'CRECHE II - CRECHE II - VESPERTINO', etapas: [1, 2, 3, 4] as const, areas, estudantes, texto: 'Ana ainda não dialoga.' };

describe('interpretarObservacoes', () => {
  it('resolves estudantes by name and keeps their exceções with trecho', async () => {
    const complete = agente({
      resposta: 'ok',
      estudantes: [{ estudante: 'Ana Ruthe', matricula: '', excecoes: [{ area: 3, habilidade: 1, conceito: 'NR', trecho: 'ainda não dialoga' }] }],
      gerais: [],
    });

    const resultado = await interpretarObservacoes({ ...base, complete });

    expect(resultado.estudantes).toEqual([
      { matricula: '10315', nome: 'ANA RUTHE IZABELLY DA SILVA', escrito: 'Ana Ruthe', excecoes: [{ area: 3, habilidade: 0, conceito: 'NR', trecho: 'ainda não dialoga', etapas: [1, 2, 3, 4] }] },
    ]);
    expect(resultado.naoResolvidos).toEqual([]);
    expect(resultado.resposta).toBe('ok');
  });

  it('lists an unknown or ambiguous name in naoResolvidos and never applies it', async () => {
    const complete = agente({
      resposta: '',
      estudantes: [
        { estudante: 'Carlos', matricula: '', excecoes: [{ area: 0, habilidade: 1, conceito: 'RD', trecho: 'Carlos' }] },
        { estudante: 'João', matricula: '', excecoes: [{ area: 0, habilidade: 2, conceito: 'RD', trecho: 'João' }] },
      ],
      gerais: [],
    });

    const resultado = await interpretarObservacoes({ ...base, complete });

    expect(resultado.estudantes).toEqual([]);
    expect(resultado.naoResolvidos.map((item) => item.estudante)).toEqual(['Carlos', 'João']);
    expect(resultado.naoResolvidos[1].candidatos).toEqual(['10316', '10317']);
    expect(resultado.naoResolvidos[0].excecoes).toHaveLength(1);
  });

  it('drops an exceção outside the chosen áreas or out of range into descartadas', async () => {
    const complete = agente({
      resposta: '',
      estudantes: [{
        estudante: 'Ana Ruthe',
        matricula: '10315',
        excecoes: [
          { area: 1, habilidade: 1, conceito: 'RD', trecho: 'área não escolhida' },
          { area: 0, habilidade: 9, conceito: 'RD', trecho: 'habilidade inexistente' },
          { area: 0, habilidade: 2, conceito: 'RD', trecho: 'válida' },
        ],
      }],
      gerais: [{ trecho: 'turma toda', excecoes: [{ area: 7, habilidade: 1, conceito: 'NR' }] }],
    });

    const resultado = await interpretarObservacoes({ ...base, complete });

    expect(resultado.estudantes[0].excecoes).toEqual([{ area: 0, habilidade: 1, conceito: 'RD', trecho: 'válida', etapas: [1, 2, 3, 4] }]);
    expect(resultado.descartadas.map((item) => item.trecho)).toEqual(['área não escolhida', 'habilidade inexistente', 'turma toda']);
    expect(resultado.gerais).toEqual([]);
  });

  it('keeps turma-wide observações in gerais', async () => {
    const complete = agente({
      resposta: '',
      estudantes: [],
      gerais: [{ trecho: 'a turma ainda não dialoga', excecoes: [{ area: 3, habilidade: 1, conceito: 'RD' }] }],
    });

    const resultado = await interpretarObservacoes({ ...base, complete });

    expect(resultado.gerais).toEqual([{ trecho: 'a turma ainda não dialoga', estudante: null, excecoes: [{ area: 3, habilidade: 0, conceito: 'RD', etapas: [1, 2, 3, 4] }] }]);
  });

  it('does not trust a matrícula the observação never wrote: an ambiguous name stays unresolved', async () => {
    const complete = agente({
      resposta: '',
      estudantes: [{ estudante: 'João', matricula: '10316', excecoes: [{ area: 0, habilidade: 1, conceito: 'RD', trecho: 'João' }] }],
      gerais: [],
    });

    const resultado = await interpretarObservacoes({ ...base, texto: 'João não lê sílabas.', complete });

    expect(resultado.estudantes).toEqual([]);
    expect(resultado.naoResolvidos[0]).toMatchObject({ estudante: 'João', candidatos: ['10316', '10317'] });
  });

  it('accepts a matrícula written in the observação', async () => {
    const complete = agente({
      resposta: '',
      estudantes: [{ estudante: 'João', matricula: '10317', excecoes: [{ area: 0, habilidade: 1, conceito: 'RD', trecho: 'João' }] }],
      gerais: [],
    });

    const resultado = await interpretarObservacoes({ ...base, texto: 'João (10317) não lê sílabas.', complete });

    expect(resultado.estudantes[0]).toMatchObject({ matricula: '10317', escrito: 'João' });
  });

  it('keeps the name as written next to the resolved estudante', async () => {
    const complete = agente({
      resposta: '',
      estudantes: [{ estudante: 'Ana Ruthe', matricula: '', excecoes: [] }],
      gerais: [],
    });

    const resultado = await interpretarObservacoes({ ...base, complete });

    expect(resultado.estudantes[0]).toMatchObject({ matricula: '10315', escrito: 'Ana Ruthe' });
  });

  it('resolves an área-wide observação about a named estudante to that estudante, as a suggestion', async () => {
    const complete = agente({
      resposta: '',
      estudantes: [],
      gerais: [
        { trecho: 'Ana tem dificuldade em EO', estudante: 'Ana Ruthe', excecoes: [{ area: 0, habilidade: 1, conceito: 'RD' }] },
        { trecho: 'a turma não escuta', estudante: '', excecoes: [{ area: 3, habilidade: 1, conceito: 'RD' }] },
      ],
    });

    const resultado = await interpretarObservacoes({ ...base, complete });

    expect(resultado.gerais).toEqual([
      { trecho: 'Ana tem dificuldade em EO', estudante: { matricula: '10315', nome: 'ANA RUTHE IZABELLY DA SILVA' }, excecoes: [{ area: 0, habilidade: 0, conceito: 'RD', etapas: [1, 2, 3, 4] }] },
      { trecho: 'a turma não escuta', estudante: null, excecoes: [{ area: 3, habilidade: 0, conceito: 'RD', etapas: [1, 2, 3, 4] }] },
    ]);
  });

  it('an exceção without etapas applies to every chosen etapa', async () => {
    const complete = agente({
      resposta: '',
      estudantes: [{ estudante: 'Ana Ruthe', matricula: '', excecoes: [{ area: 0, habilidade: 1, conceito: 'RD', trecho: 'Ana', etapas: [] }] }],
      gerais: [],
    });

    const resultado = await interpretarObservacoes({ ...base, etapas: [2, 3], complete });

    expect(resultado.estudantes[0].excecoes[0].etapas).toEqual([2, 3]);
  });

  it('keeps only chosen etapas and discards an exceção left without any', async () => {
    const complete = agente({
      resposta: '',
      estudantes: [{
        estudante: 'Ana Ruthe',
        matricula: '',
        excecoes: [
          { area: 0, habilidade: 1, conceito: 'RD', trecho: 'na I e na III', etapas: [1, 3] },
          { area: 0, habilidade: 2, conceito: 'NR', trecho: 'só na IV', etapas: [4] },
        ],
      }],
      gerais: [],
    });

    const resultado = await interpretarObservacoes({ ...base, etapas: [1, 2], complete });

    expect(resultado.estudantes[0].excecoes).toEqual([{ area: 0, habilidade: 0, conceito: 'RD', trecho: 'na I e na III', etapas: [1] }]);
    expect(resultado.descartadas).toEqual([{ trecho: 'só na IV', motivo: 'A observação fala de uma etapa que não está sendo preenchida.' }]);
  });

  it('the prompt lists the etapas being filled', async () => {
    const complete = agente({ resposta: '', estudantes: [], gerais: [] });

    await interpretarObservacoes({ ...base, complete });

    const { system } = complete.mock.calls[0][0] as { system: string };
    expect(system).toContain('I ETAPA, II ETAPA, III ETAPA e IV ETAPA');
  });

  it('expands "todas as habilidades" of every chosen área into one exceção per habilidade', async () => {
    const complete = agente({
      resposta: '',
      estudantes: [],
      gerais: [{
        trecho: 'melhoria gradual',
        estudante: '',
        excecoes: [
          { area: -1, habilidade: -1, conceito: 'NR', etapas: [1] },
          { area: -1, habilidade: -1, conceito: 'RD', etapas: [2, 3] },
        ],
      }],
    });

    const resultado = await interpretarObservacoes({ ...base, complete });

    const chaves = (conceito: string) => resultado.gerais[0].excecoes
      .filter((e) => e.conceito === conceito)
      .map((e) => `${e.area}.${e.habilidade}:${e.etapas.join('')}`);
    expect(chaves('NR')).toEqual(['0.0:1', '0.1:1', '3.0:1']);
    expect(chaves('RD')).toEqual(['0.0:23', '0.1:23', '3.0:23']);
  });

  it('expands "todas as habilidades" of one área for an estudante', async () => {
    const complete = agente({
      resposta: '',
      estudantes: [{ estudante: 'Ana Ruthe', matricula: '', excecoes: [{ area: 0, habilidade: -1, conceito: 'RD', trecho: 'tudo em EO', etapas: [] }] }],
      gerais: [],
    });

    const resultado = await interpretarObservacoes({ ...base, complete });

    expect(resultado.estudantes[0].excecoes.map((e) => `${e.area}.${e.habilidade}`)).toEqual(['0.0', '0.1']);
  });

  it('the prompt explains melhoria gradual as NR, then RD, then R', async () => {
    const complete = agente({ resposta: '', estudantes: [], gerais: [] });

    await interpretarObservacoes({ ...base, complete });

    const { system } = complete.mock.calls[0][0] as { system: string };
    expect(system).toContain('NR na I ETAPA, RD na II e na III ETAPA e R na IV ETAPA');
  });

  it('turns a melhoria into conceitos: gradual is NR, then RD, then R from the etapa it improved', async () => {
    const complete = agente({
      resposta: '',
      estudantes: [
        { estudante: 'Ana Ruthe', matricula: '', excecoes: [{ area: 0, habilidade: 1, tipo: 'melhoria', conceito: 'RD', etapas: [], etapaDaMelhoria: 3, gradual: true, trecho: 'melhorou na III' }] },
        { estudante: 'João Pedro', matricula: '', excecoes: [{ area: 0, habilidade: 2, tipo: 'melhoria', conceito: 'RD', etapas: [], etapaDaMelhoria: 4, gradual: true, trecho: 'melhorou na IV' }] },
        { estudante: 'João Miguel', matricula: '', excecoes: [{ area: 0, habilidade: 1, tipo: 'melhoria', conceito: 'RD', etapas: [], etapaDaMelhoria: 3, gradual: false, trecho: 'melhorou na III' }] },
      ],
      gerais: [],
    });

    const resultado = await interpretarObservacoes({ ...base, complete });

    const de = (matricula: string) => resultado.estudantes.find((e) => e.matricula === matricula)!.excecoes
      .map((e) => `${e.area}.${e.habilidade}:${e.conceito}${e.etapas.join('')}`);
    expect(de('10315')).toEqual(['0.0:NR1', '0.0:RD2']);
    expect(de('10316')).toEqual(['0.1:NR1', '0.1:RD23']);
    expect(de('10317')).toEqual(['0.0:RD12']);
  });

  it('reads the habilidade by the number the ficha shows, not its position', async () => {
    const complete = agente({ resposta: '', estudantes: [], gerais: [] });

    await interpretarObservacoes({ ...base, complete });

    const { system } = complete.mock.calls[0][0] as { system: string };
    expect(system).toContain('0.2 — Comunica-se com adultos.');
  });

  it('throws EnvioInvalidoError when there is no text and no file', async () => {
    await expect(interpretarObservacoes({ ...base, texto: '  ', complete: agente({}) })).rejects.toBeInstanceOf(EnvioInvalidoError);
  });

  it('lists the chosen habilidades with área and habilidade indices in the prompt', async () => {
    const complete = agente({ resposta: '', estudantes: [], gerais: [] });

    await interpretarObservacoes({ ...base, complete });

    const { system } = complete.mock.calls[0][0] as { system: string };
    expect(system).toContain('3.1 — Dialoga com crianças.');
    expect(system).toContain('ANA RUTHE IZABELLY DA SILVA (10315)');
  });
});
