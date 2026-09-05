import type { Page } from 'playwright';

import { listEstudantes } from '../scrape/portal';
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
 * Os estudantes matriculados numa turma, lidos da tela de _Ficha Desempenho_
 * do portal — é ela que lista a turma inteira com matrícula, nome, situação e
 * data da matrícula.
 *
 * A turma basta: ao contrário das aulas, quem está matriculado não varia por
 * etapa, então não há por que percorrer o catálogo.
 */
export async function buscarEstudantes(
  page: Page,
  turma: string,
): Promise<EstudanteDaTurma[]> {
  const doPortal = await listEstudantes(page, { turma });

  // O portal omite situação e data quando não as tem; o banco guarda a
  // ausência como null.
  return doPortal.map((estudante) => ({
    matricula: estudante.matricula,
    nome: estudante.nome,
    situacao: estudante.situacao ?? null,
    dataMatricula: estudante.dataMatricula ?? null,
  }));
}
