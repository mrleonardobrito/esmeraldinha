import { describe, expect, it } from 'vitest';

import { lerCelulaDoEstudante } from '../portal';

/**
 * As células abaixo são o texto que sai do HTML real da tela de Ficha
 * Desempenho depois que o rótulo da coluna é removido e os espaços são
 * normalizados — o que `textoDaCelula` entrega. Ver
 * `.scratch/estudantes-da-turma/tela-do-portal.md`.
 */
describe('lerCelulaDoEstudante', () => {
  it('lê nome, situação e data da matrícula de um estudante ativo', () => {
    const celula =
      'ADYLLA LUIZA FERREIRA Avaliar Nome social: Situação: ATIVO ' +
      'Data da matrícula: 13/02/2026';

    expect(lerCelulaDoEstudante(celula)).toEqual({
      nome: 'ADYLLA LUIZA FERREIRA',
      situacao: 'ATIVO',
      dataMatricula: '13/02/2026',
    });
  });

  it('lê a situação de quem não está mais na turma', () => {
    const celula =
      'BENJAMIN DE OLIVEIRA SILVA Avaliar Nome social: Situação: TRANSFERIDO ' +
      'Data da matrícula: 05/01/2026';

    expect(lerCelulaDoEstudante(celula)).toMatchObject({
      nome: 'BENJAMIN DE OLIVEIRA SILVA',
      situacao: 'TRANSFERIDO',
    });
  });

  it('mantém nomes compostos longos inteiros', () => {
    const celula =
      'HEITOR VALENTIM DOS SANTOS SCHWELLBERGER Avaliar Nome social: ' +
      'Situação: TRANSFERIDO Data da matrícula: 23/12/2025';

    expect(lerCelulaDoEstudante(celula).nome).toBe(
      'HEITOR VALENTIM DOS SANTOS SCHWELLBERGER',
    );
  });

  it('prefere o nome social quando o portal o traz', () => {
    const celula =
      'JOSEFA EMANUELLY SOARES DE SOUZA Avaliar Nome social: EMANUELLY SOUZA ' +
      'Situação: ATIVO Data da matrícula: 05/01/2026';

    expect(lerCelulaDoEstudante(celula).nome).toBe('EMANUELLY SOUZA');
  });

  it('deixa situação e data de fora quando o portal não as escreve', () => {
    expect(lerCelulaDoEstudante('CID GABRIEL PLACIDO DANTAS Avaliar')).toEqual({
      nome: 'CID GABRIEL PLACIDO DANTAS',
      situacao: undefined,
      dataMatricula: undefined,
    });
  });

  it('não confunde a data da matrícula com outra data na célula', () => {
    const celula =
      'ANA LUIZA CARVALHO DA SILVA Avaliar Nome social: Situação: ATIVO ' +
      'Data da matrícula: 09/02/2026';

    expect(lerCelulaDoEstudante(celula).dataMatricula).toBe('09/02/2026');
  });
});
