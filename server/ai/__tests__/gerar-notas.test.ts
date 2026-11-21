import { describe, expect, it, vi } from 'vitest';

import { EnvioInvalidoError } from '../errors';
import { gerarNotas, type GerarNotasInput } from '../gerar-notas';

const base: Omit<GerarNotasInput, 'complete'> = {
  turma: '3º ANO - 3º ANO B - INTEGRAL',
  etapa: 'I ETAPA',
  disciplina: 'MATEMÁTICA - BNCC',
  avaliacoes: ['OBSERVAÇÃO', 'TRABALHO INDIVIDUAL', 'TRABALHO EM GRUPO', 'AVALIAÇÃO/PROVA'].map(
    (nome) => ({ nome, valor: 2.5 }),
  ),
  estudantes: [
    { matricula: '1', nome: 'ANA LIMA', notaFinal: 10, classificacao: 'Acima da média' },
    { matricula: '2', nome: 'BRUNO SOUZA', notaFinal: 10, classificacao: 'Acima da média' },
    { matricula: '3', nome: 'BRUNO ALVES', notaFinal: null, classificacao: null },
  ],
  mensagens: [{ papel: 'auxiliar', texto: 'A Ana não alcançou a média.' }],
};

function agente(notas: { matricula: string; estudante: string; notaFinal: number }[]) {
  return vi.fn().mockResolvedValue(JSON.stringify({ resposta: 'Feito.', notas }));
}

describe('gerarNotas', () => {
  it('returns the nota final of each estudante the agent changed', async () => {
    const complete = agente([{ matricula: '1', estudante: 'Ana', notaFinal: 5 }]);

    await expect(gerarNotas({ ...base, complete })).resolves.toEqual({
      resposta: 'Feito.',
      notas: [{ matricula: '1', notaFinal: 5 }],
      falhas: [],
    });
  });

  it('finds the estudante by name and rounds the nota to 0,5', async () => {
    const complete = agente([{ matricula: '', estudante: 'Ana Lima', notaFinal: 8.3 }]);

    const gerado = await gerarNotas({ ...base, complete });

    expect(gerado.notas).toEqual([{ matricula: '1', notaFinal: 8.5 }]);
  });

  it('reports unknown and ambiguous estudantes and still applies the rest', async () => {
    const complete = agente([
      { matricula: '', estudante: 'Bruno', notaFinal: 5 },
      { matricula: '', estudante: 'Carla', notaFinal: 5 },
      { matricula: '1', estudante: 'Ana', notaFinal: 12 },
    ]);

    const gerado = await gerarNotas({ ...base, complete });

    expect(gerado.notas).toEqual([{ matricula: '1', notaFinal: 10 }]);
    expect(gerado.falhas.map((falha) => falha.estudante)).toEqual(['Bruno', 'Carla']);
    expect(gerado.falhas.every((falha) => falha.motivo.length > 0)).toBe(true);
  });

  it('keeps the last nota when the agent repeats an estudante', async () => {
    const complete = agente([
      { matricula: '1', estudante: 'Ana', notaFinal: 5 },
      { matricula: '1', estudante: 'Ana', notaFinal: 7 },
    ]);

    const gerado = await gerarNotas({ ...base, complete });

    expect(gerado.notas).toEqual([{ matricula: '1', notaFinal: 7 }]);
  });

  it('rejects an answer outside the schema', async () => {
    const complete = vi.fn().mockResolvedValue('not json');

    await expect(gerarNotas({ ...base, complete })).rejects.toBeInstanceOf(EnvioInvalidoError);
  });

  it('tells the agent the bands, the avaliações and every estudante', async () => {
    const complete = agente([]);

    await gerarNotas({ ...base, complete });

    const pedido = complete.mock.calls[0][0] as {
      system: string;
      content: { type: string; text: string }[];
    };
    expect(pedido.system).toContain('Acima da média: de 8 a 10');
    expect(pedido.system).toContain('AVALIAÇÃO/PROVA (vale 2,5)');
    // Seen with the real model: "não conseguiu média" landed on Na média, and
    // "acima da média" gave everyone the same nota.
    expect(pedido.system).toContain(
      '"Não alcançou a média", "não conseguiu média suficiente", "ficou sem média" ou "reprovou": Abaixo da média, menos de 6',
    );
    expect(pedido.system).toContain('notas diferentes entre os estudantes');
    expect(pedido.system).toContain(
      'Quando o auxiliar descrever a turma inteira, liste TODOS os estudantes',
    );
    const texto = pedido.content.map((parte) => parte.text).join('\n');
    expect(texto).toContain('- 1 | ANA LIMA | nota final atual: 10 | Acima da média');
    expect(texto).toContain('- 3 | BRUNO ALVES | nota final atual: — | —');
    expect(texto).toContain('Auxiliar de ensino: A Ana não alcançou a média.');
  });
});
