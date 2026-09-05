import type { NotaLida } from '../ai/interpretar-envio';
import type { NotaParaLancar } from '../scrape/types';
import { resolverMatricula, type EstudanteConhecido } from './estudantes';

/**
 * Traduz as notas que o agente leu para as notas que o portal aceita: o nome
 * do estudante vira a matrícula dele. Um nome que não casa com exatamente um
 * estudante da turma interrompe tudo — é a mesma escolha que `postAulaContent`
 * faz com as linhas de aula, e pela mesma razão.
 *
 * @throws {EstudanteNaoEncontradoError} quando um nome não é da turma.
 * @throws {EstudanteAmbiguoError} quando um nome serve a mais de um estudante.
 */
export function resolverNotas(
  notas: readonly NotaLida[],
  avaliacao: string,
  estudantes: readonly EstudanteConhecido[],
): NotaParaLancar[] {
  return notas.map((nota) => ({
    matricula: resolverMatricula(nota.estudante, estudantes),
    avaliacao,
    valor: nota.valor,
  }));
}

/** Uma nota já resolvida, ou o motivo de não ter sido. */
export type NotaResolvida =
  | { readonly status: 'pronta'; readonly nota: NotaParaLancar }
  | { readonly status: 'falha'; readonly estudante: string; readonly motivo: string };

/**
 * A versão da preview de {@link resolverNotas}: resolve o que dá, e devolve o
 * motivo de cada nota que não deu — em vez de abortar tudo na primeira, como
 * faz `resolverNotas` na hora de gravar de verdade.
 */
export function resolverNotasParaPreview(
  notas: readonly NotaLida[],
  avaliacao: string,
  estudantes: readonly EstudanteConhecido[],
): NotaResolvida[] {
  return notas.map((nota) => {
    try {
      return {
        status: 'pronta',
        nota: {
          matricula: resolverMatricula(nota.estudante, estudantes),
          avaliacao,
          valor: nota.valor,
        },
      };
    } catch (error) {
      return {
        status: 'falha',
        estudante: nota.estudante,
        motivo: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
