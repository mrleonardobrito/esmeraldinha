import type { Page } from 'playwright';

import type { ConteudoCatalogo } from '../scrape/types';
import type { EstudanteDaTurma } from './store';

/**
 * As turmas do professor, sem repetir as que aparecem em mais de uma etapa.
 * O portal não tem uma tela de "minhas turmas": elas aparecem como opções do
 * filtro de Lançamento de Conteúdo, uma lista por etapa.
 */
export function turmasDoCatalogo(catalogo: ConteudoCatalogo): string[] {
  return [...new Set(catalogo.etapas.flatMap((etapa) => etapa.turmas))];
}

/**
 * Os estudantes matriculados numa turma, lidos do portal.
 *
 * TODO: a tela de Lançamento de Presença lista matrícula, nome e situação —
 * `listEstudantes` em `server/scrape/portal.ts` já os lê, mas ainda não a data
 * da matrícula, e seus seletores não foram conferidos contra o portal de
 * verdade. Enquanto isso, a busca devolve lista vazia: uma turma sem
 * estudantes é o estado honesto de quem ainda não os leu.
 */
export async function buscarEstudantes(
  _page: Page,
  _turma: string,
  _catalogo: ConteudoCatalogo,
): Promise<EstudanteDaTurma[]> {
  return [];
}
