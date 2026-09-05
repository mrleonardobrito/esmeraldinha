import type { Page } from 'playwright';

import {
  listAulas,
  listBoletim,
  listDisciplinas,
  listEstudantes,
} from '../scrape/portal';
import type { ConteudoCatalogo } from '../scrape/types';
import { turmasDoCatalogo } from '../turmas/busca';
import type { BoletimRaspado, EtapaRaspada, RaspagemDaTurma } from './store';

export class TurmaNaoEncontradaError extends Error {
  constructor(
    readonly turma: string,
    readonly disponiveis: readonly string[],
  ) {
    super(
      `A turma "${turma}" não existe para este professor. ` +
        `Turmas disponíveis: ${disponiveis.join(', ') || 'nenhuma'}.`,
    );
    this.name = 'TurmaNaoEncontradaError';
  }
}

/**
 * Percorre o portal etapa por etapa, mês por mês, juntando as aulas datadas da
 * turma. É a volta cara que justifica guardar o resultado no banco: são tantas
 * idas ao portal quanto etapas vezes meses.
 *
 * @throws {TurmaNaoEncontradaError} quando a turma não é de nenhuma etapa.
 */
export async function rasparCaderneta(
  page: Page,
  catalogo: ConteudoCatalogo,
  turma: string,
): Promise<RaspagemDaTurma> {
  const disponiveis = turmasDoCatalogo(catalogo);

  if (!disponiveis.includes(turma)) {
    throw new TurmaNaoEncontradaError(turma, disponiveis);
  }

  const etapas: EtapaRaspada[] = [];

  // As aulas primeiro, todas elas. Ler aula e boletim alternadamente obrigaria
  // o portal a trocar de tela a cada etapa — _Lançamento de Conteúdo_ e
  // _Resultado de Avaliação_ —, e é no meio dessa troca que os menus do
  // PrimeFaces deixam de responder ao clique. Uma tela por vez.
  for (const etapa of catalogo.etapas) {
    // Uma etapa que não oferece a turma não tem aulas dela: entra vazia para a
    // grade continuar mostrando as quatro colunas.
    if (!etapa.turmas.includes(turma)) {
      etapas.push({ nome: etapa.nome, meses: [...etapa.meses], aulas: [] });
      continue;
    }

    const aulas: EtapaRaspada['aulas'] = [];

    for (const mes of etapa.meses) {
      const doMes = await listAulas(page, { etapa: etapa.nome, turma, mes });
      aulas.push(...doMes.map((aula) => ({ ...aula, mes })));
    }

    etapas.push({ nome: etapa.nome, meses: [...etapa.meses], aulas });
  }

  // Agora os boletins, já na outra tela. Uma falha aqui não pode custar as
  // aulas que acabaram de ser lidas — o mesmo cuidado que a lista de
  // estudantes recebe logo abaixo.
  for (const etapa of etapas) {
    if (!catalogo.etapas.find((atual) => atual.nome === etapa.nome)?.turmas.includes(turma)) {
      continue;
    }

    const boletins: BoletimRaspado[] = [];

    try {
      // Sem disciplina não há avaliação cadastrada, e portanto nada a ler: a
      // etapa fica sem boletim nenhum e a tela pede o cadastro.
      for (const disciplina of await listDisciplinas(page, { etapa: etapa.nome, turma })) {
        const boletim = await listBoletim(page, {
          etapa: etapa.nome,
          turma,
          disciplina,
        });

        boletins.push({ disciplina, ...boletim });
      }
    } catch (error) {
      console.error(`Falha ao ler o boletim de ${turma} na ${etapa.nome}:`, error);
    }

    etapa.boletins = boletins;
  }

  // Os estudantes são da turma, não da etapa: a tela de Ficha Desempenho os
  // lista pela turma sozinha, então basta lê-los uma vez.
  let estudantes: RaspagemDaTurma['estudantes'] = [];

  try {
    const doPortal = await listEstudantes(page, { turma });
    // O portal omite a situação e a data; o banco guarda a ausência como null.
    estudantes = doPortal.map((estudante) => ({
      matricula: estudante.matricula,
      nome: estudante.nome,
      situacao: estudante.situacao ?? null,
      dataMatricula: estudante.dataMatricula ?? null,
    }));
  } catch (error) {
    // A lista de estudantes não pode derrubar o que já sabemos das aulas.
    console.error(`Falha ao ler os estudantes de ${turma}:`, error);
  }

  return { etapas, estudantes };
}
