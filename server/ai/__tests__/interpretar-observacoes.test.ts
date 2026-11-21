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

const base = { turma: 'CRECHE II - CRECHE II - VESPERTINO', etapa: 'I ETAPA', areas, estudantes, texto: 'Ana ainda não dialoga.' };

describe('interpretarObservacoes', () => {
  it('resolves estudantes by name and keeps their exceções with trecho', async () => {
    const complete = agente({
      resposta: 'ok',
      estudantes: [{ estudante: 'Ana Ruthe', matricula: '', excecoes: [{ area: 3, habilidade: 0, conceito: 'NR', trecho: 'ainda não dialoga' }] }],
      gerais: [],
    });

    const resultado = await interpretarObservacoes({ ...base, complete });

    expect(resultado.estudantes).toEqual([
      { matricula: '10315', nome: 'ANA RUTHE IZABELLY DA SILVA', escrito: 'Ana Ruthe', excecoes: [{ area: 3, habilidade: 0, conceito: 'NR', trecho: 'ainda não dialoga' }] },
    ]);
    expect(resultado.naoResolvidos).toEqual([]);
    expect(resultado.resposta).toBe('ok');
  });

  it('lists an unknown or ambiguous name in naoResolvidos and never applies it', async () => {
    const complete = agente({
      resposta: '',
      estudantes: [
        { estudante: 'Carlos', matricula: '', excecoes: [{ area: 0, habilidade: 0, conceito: 'RD', trecho: 'Carlos' }] },
        { estudante: 'João', matricula: '', excecoes: [{ area: 0, habilidade: 1, conceito: 'RD', trecho: 'João' }] },
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
          { area: 1, habilidade: 0, conceito: 'RD', trecho: 'área não escolhida' },
          { area: 0, habilidade: 9, conceito: 'RD', trecho: 'habilidade inexistente' },
          { area: 0, habilidade: 1, conceito: 'RD', trecho: 'válida' },
        ],
      }],
      gerais: [{ trecho: 'turma toda', excecoes: [{ area: 7, habilidade: 0, conceito: 'NR' }] }],
    });

    const resultado = await interpretarObservacoes({ ...base, complete });

    expect(resultado.estudantes[0].excecoes).toEqual([{ area: 0, habilidade: 1, conceito: 'RD', trecho: 'válida' }]);
    expect(resultado.descartadas.map((item) => item.trecho)).toEqual(['área não escolhida', 'habilidade inexistente', 'turma toda']);
    expect(resultado.gerais).toEqual([]);
  });

  it('keeps turma-wide observações in gerais', async () => {
    const complete = agente({
      resposta: '',
      estudantes: [],
      gerais: [{ trecho: 'a turma ainda não dialoga', excecoes: [{ area: 3, habilidade: 0, conceito: 'RD' }] }],
    });

    const resultado = await interpretarObservacoes({ ...base, complete });

    expect(resultado.gerais).toEqual([{ trecho: 'a turma ainda não dialoga', estudante: null, excecoes: [{ area: 3, habilidade: 0, conceito: 'RD' }] }]);
  });

  it('does not trust a matrícula the observação never wrote: an ambiguous name stays unresolved', async () => {
    const complete = agente({
      resposta: '',
      estudantes: [{ estudante: 'João', matricula: '10316', excecoes: [{ area: 0, habilidade: 0, conceito: 'RD', trecho: 'João' }] }],
      gerais: [],
    });

    const resultado = await interpretarObservacoes({ ...base, texto: 'João não lê sílabas.', complete });

    expect(resultado.estudantes).toEqual([]);
    expect(resultado.naoResolvidos[0]).toMatchObject({ estudante: 'João', candidatos: ['10316', '10317'] });
  });

  it('accepts a matrícula written in the observação', async () => {
    const complete = agente({
      resposta: '',
      estudantes: [{ estudante: 'João', matricula: '10317', excecoes: [{ area: 0, habilidade: 0, conceito: 'RD', trecho: 'João' }] }],
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
        { trecho: 'Ana tem dificuldade em EO', estudante: 'Ana Ruthe', excecoes: [{ area: 0, habilidade: 0, conceito: 'RD' }] },
        { trecho: 'a turma não escuta', estudante: '', excecoes: [{ area: 3, habilidade: 0, conceito: 'RD' }] },
      ],
    });

    const resultado = await interpretarObservacoes({ ...base, complete });

    expect(resultado.gerais).toEqual([
      { trecho: 'Ana tem dificuldade em EO', estudante: { matricula: '10315', nome: 'ANA RUTHE IZABELLY DA SILVA' }, excecoes: [{ area: 0, habilidade: 0, conceito: 'RD' }] },
      { trecho: 'a turma não escuta', estudante: null, excecoes: [{ area: 3, habilidade: 0, conceito: 'RD' }] },
    ]);
  });

  it('throws EnvioInvalidoError when there is no text and no file', async () => {
    await expect(interpretarObservacoes({ ...base, texto: '  ', complete: agente({}) })).rejects.toBeInstanceOf(EnvioInvalidoError);
  });

  it('lists the chosen habilidades with área and habilidade indices in the prompt', async () => {
    const complete = agente({ resposta: '', estudantes: [], gerais: [] });

    await interpretarObservacoes({ ...base, complete });

    const { system } = complete.mock.calls[0][0] as { system: string };
    expect(system).toContain('3.0 1° Dialoga com crianças.');
    expect(system).toContain('ANA RUTHE IZABELLY DA SILVA (10315)');
  });
});
