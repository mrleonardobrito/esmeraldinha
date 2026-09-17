import type { Page } from 'playwright';

import { listEstudantes } from '../scrape/portal';
import type { ConteudoCatalogo, EtapaOptions } from '../scrape/types';
import type { EstudanteDaTurma } from './store';

/** Uma turma do catálogo com o período letivo em que o portal a oferece. */
export interface TurmaDoCatalogo {
  readonly nome: string;
  readonly periodoLetivo: string;
}

/**
 * As turmas do professor, sem repetir as que aparecem em mais de uma etapa,
 * cada uma com o período letivo em que mora. O portal não tem uma tela de
 * "minhas turmas": elas aparecem como opções do filtro de Lançamento de
 * Conteúdo, uma lista por etapa de cada período letivo.
 */
export function turmasDoCatalogo(catalogo: ConteudoCatalogo): string[] {
  return turmasComPeriodo(catalogo).map((turma) => turma.nome);
}

export function turmasComPeriodo(catalogo: ConteudoCatalogo): TurmaDoCatalogo[] {
  const porNome = new Map<string, TurmaDoCatalogo>();

  for (const etapa of catalogo.etapas) {
    for (const nome of etapa.turmas) {
      if (!porNome.has(nome)) porNome.set(nome, { nome, periodoLetivo: etapa.periodoLetivo });
    }
  }

  return [...porNome.values()];
}

/** O período letivo em que a turma mora, ou `undefined` quando ela não é do catálogo. */
export function periodoLetivoDaTurma(
  catalogo: ConteudoCatalogo,
  turma: string,
): string | undefined {
  return catalogo.etapas.find((etapa) => etapa.turmas.includes(turma))?.periodoLetivo;
}

/**
 * As etapas em que a turma pode aparecer: as do período letivo dela. Uma
 * etapa de outro período não é da caderneta desta turma, mesmo que tenha o
 * mesmo nome.
 */
export function etapasDaTurma(catalogo: ConteudoCatalogo, turma: string): EtapaOptions[] {
  const periodoLetivo = periodoLetivoDaTurma(catalogo, turma);

  return catalogo.etapas.filter((etapa) => etapa.periodoLetivo === periodoLetivo);
}

/**
 * Os estudantes matriculados numa turma, lidos da tela de _Ficha Desempenho_
 * do portal — é ela que lista a turma inteira com matrícula, nome, situação e
 * data da matrícula.
 *
 * A turma e o período dela bastam: ao contrário das aulas, quem está
 * matriculado não varia por etapa, então não há por que percorrer o catálogo.
 */
export async function buscarEstudantes(
  page: Page,
  turma: string,
  periodoLetivo?: string,
): Promise<EstudanteDaTurma[]> {
  const doPortal = await listEstudantes(page, { turma, periodoLetivo });

  // O portal omite situação e data quando não as tem; o banco guarda a
  // ausência como null.
  return doPortal.map((estudante) => ({
    matricula: estudante.matricula,
    nome: estudante.nome,
    situacao: estudante.situacao ?? null,
    dataMatricula: estudante.dataMatricula ?? null,
  }));
}
