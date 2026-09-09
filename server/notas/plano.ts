import type { NotasDoEstudanteLidas } from '../ai/interpretar-envio';
import type { NotaParaLancar } from '../scrape/types';
import {
  resolverMatriculaDaNota,
  EstudanteAmbiguoError,
  type EstudanteConhecido,
} from './estudantes';

/**
 * Traduz as notas que o agente leu para as notas que o portal aceita: a
 * matrícula que o material trouxe, ou o nome do estudante quando ela não é da
 * turma. Uma nota que não casa com exatamente um estudante da turma
 * interrompe tudo — é a mesma escolha que `postAulaContent` faz com as linhas
 * de aula, e pela mesma razão.
 *
 * @throws {EstudanteNaoEncontradoError} quando nem a matrícula nem o nome casam.
 * @throws {EstudanteAmbiguoError} quando um nome serve a mais de um estudante.
 */
export function resolverNotas(
  notas: readonly NotasDoEstudanteLidas[],
  estudantes: readonly EstudanteConhecido[],
): NotaParaLancar[] {
  return notas.flatMap((notasDoEstudante) => {
    const matricula = resolverMatriculaDaNota(notasDoEstudante, estudantes);

    return notasDoEstudante.notas.map((nota) => ({
      matricula,
      avaliacao: nota.avaliacao,
      valor: nota.valor,
    }));
  });
}

/** As notas de um estudante já resolvidas, ou o motivo de não terem sido. */
export type NotaResolvida =
  | { readonly status: 'pronta'; readonly notas: readonly NotaParaLancar[] }
  | {
      readonly status: 'falha';
      readonly estudante: string;
      readonly motivo: string;
      readonly candidatos?: readonly string[];
    };

/**
 * A versão da preview de {@link resolverNotas}: resolve o que dá, e devolve o
 * motivo de cada nota que não deu — em vez de abortar tudo na primeira, como
 * faz `resolverNotas` na hora de gravar de verdade.
 */
export function resolverNotasParaPreview(
  notas: readonly NotasDoEstudanteLidas[],
  estudantes: readonly EstudanteConhecido[],
): NotaResolvida[] {
  return notas.map((notasDoEstudante) => {
    try {
      const matricula = resolverMatriculaDaNota(notasDoEstudante, estudantes);

      return {
        status: 'pronta',
        notas: notasDoEstudante.notas.map((nota) => ({
          matricula,
          avaliacao: nota.avaliacao,
          valor: nota.valor,
        })),
      };
    } catch (error) {
      const candidatos =
        error instanceof EstudanteAmbiguoError
          ? estudantes
              .filter((estudante) => error.candidatos.includes(estudante.nome))
              .map((estudante) => estudante.matricula)
          : undefined;

      return {
        status: 'falha',
        estudante: notasDoEstudante.estudante,
        motivo: error instanceof Error ? error.message : String(error),
        ...(candidatos && candidatos.length > 0 ? { candidatos } : {}),
      };
    }
  });
}
