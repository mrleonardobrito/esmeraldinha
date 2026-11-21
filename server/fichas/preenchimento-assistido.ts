import type { Page } from 'playwright';

import type { Excecao, IndiceDaEtapa } from '../../shared/ficha-de-desempenho';
import {
  abrirEstudanteDaLista,
  abrirFichaDaTurma,
  escreverConceitos,
  lerDialogoDaFicha,
  matriculaDoDialogo,
  matriculasDaLista,
} from '../scrape/ficha-de-desempenho';
import { waitForAjax } from '../scrape/primefaces';
import { planejarEstudante, type PlanoDoEstudante } from './regras';

export type StatusDoPreenchimento =
  | 'abrindo'
  | 'preenchendo'
  | 'aguardando-auxiliar'
  | 'concluido'
  | 'interrompido'
  | 'falhou';

export interface EstadoDoPreenchimento {
  status: StatusDoPreenchimento;
  etapa: string;
  /** How many ATIVO estudantes the run should fill. */
  total: number;
  atual: { matricula: string; nome: string } | null;
  preenchidos: {
    matricula: string;
    nome: string;
    escritas: number;
    mantidos: PlanoDoEstudante['mantidos'];
    jaPreenchidos: number;
  }[];
  pulados: { matricula: string; nome: string; motivo: string }[];
  erro: string | null;
}

export interface PlanoDoPreenchimento {
  periodoLetivo?: string;
  turma: string;
  etapa: IndiceDaEtapa;
  nomeDaEtapa: string;
  areas: number[];
  estudantes: readonly { matricula: string; nome: string; situacao: string | null }[];
  /** Exceções per matrícula; everyone else gets R. */
  excecoes: ReadonlyMap<string, readonly Excecao[]>;
}

const EM_ANDAMENTO: readonly StatusDoPreenchimento[] = ['abrindo', 'preenchendo', 'aguardando-auxiliar'];

const ativo = (estudante: { situacao: string | null }) =>
  !estudante.situacao || estudante.situacao.trim().toUpperCase() === 'ATIVO';

/**
 * Waits until the dialog shows another estudante (the auxiliar clicked a
 * Salvar e próximo/anterior), closes (null), or nothing happens for too long.
 */
async function esperarOutroEstudante(
  page: Page,
  atual: string,
  { intervaloMs, ociosoMs, signal }: { intervaloMs: number; ociosoMs: number; signal?: AbortSignal },
): Promise<string | null | 'ocioso'> {
  const inicio = Date.now();
  let semDialogo = 0;
  for (;;) {
    if (page.isClosed() || signal?.aborted) return null;
    const matricula = await matriculaDoDialogo(page).catch(() => null);
    if (matricula !== null && matricula !== atual) return matricula;

    // While a Salvar runs, the portal empties the dialog before rendering the
    // next estudante: no dialog only means closed once the page is idle and
    // it stays that way.
    if (matricula === null) {
      semDialogo = (await ajaxEmAndamento(page)) ? 0 : semDialogo + 1;
      if (semDialogo >= 2) return null;
    } else {
      semDialogo = 0;
    }

    if (Date.now() - inicio > ociosoMs) return 'ocioso';
    await page.waitForTimeout(intervaloMs).catch(() => {});
  }
}

async function ajaxEmAndamento(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      const janela = window as unknown as {
        PrimeFaces?: { ajax?: { Queue?: { isEmpty?: () => boolean } } };
        jQuery?: { active: number };
      };
      return janela.PrimeFaces?.ajax?.Queue?.isEmpty?.() === false || (janela.jQuery?.active ?? 0) > 0;
    })
    .catch(() => false);
}

/**
 * The preenchimento assistido of the ficha de desempenho: opens the first
 * ATIVO estudante's ficha, writes the etapa's conceitos, and waits for the
 * auxiliar de ensino to save. Each estudante the dialog moves to is filled
 * once; the auxiliar's own edits are never overwritten. Never saves.
 */
export async function acompanharPreenchimento(
  page: Page,
  plano: PlanoDoPreenchimento,
  onEstado: (estado: EstadoDoPreenchimento) => void,
  { intervaloMs = 500, ociosoMs = 30 * 60_000, signal }: { intervaloMs?: number; ociosoMs?: number; signal?: AbortSignal } = {},
): Promise<EstadoDoPreenchimento> {
  const ativos = plano.estudantes.filter(ativo);
  const estado: EstadoDoPreenchimento = {
    status: 'abrindo',
    etapa: plano.nomeDaEtapa,
    total: ativos.length,
    atual: null,
    preenchidos: [],
    pulados: [],
    erro: null,
  };
  const emitir = (mudanca: Partial<EstadoDoPreenchimento>) => {
    Object.assign(estado, mudanca);
    onEstado({ ...estado, preenchidos: [...estado.preenchidos], pulados: [...estado.pulados] });
  };
  emitir({});

  try {
    await abrirFichaDaTurma(page, { periodoLetivo: plano.periodoLetivo, turma: plano.turma });
    const primeira = (await matriculasDaLista(page)).find((m) => ativos.some((a) => a.matricula === m));
    if (!primeira) {
      emitir({ status: 'concluido' });
      return estado;
    }
    await abrirEstudanteDaLista(page, primeira);

    const tratados = new Set<string>();
    let atual: string | null = primeira;

    while (atual !== null) {
      const matricula: string = atual;
      const estudante = plano.estudantes.find((e) => e.matricula === matricula);
      const nome = estudante?.nome ?? '';

      if (!tratados.has(matricula)) {
        tratados.add(matricula);
        if (!estudante || !ativo(estudante)) {
          estado.pulados.push({
            matricula,
            nome,
            motivo: estudante ? `Situação ${estudante.situacao}.` : 'Estudante fora da caderneta.',
          });
        } else {
          emitir({ status: 'preenchendo', atual: { matricula, nome } });
          const dialogo = await lerDialogoDaFicha(page);
          if (dialogo.matricula !== matricula) {
            // The dialog moved while it was being read: start over on the new one.
            tratados.delete(matricula);
            atual = dialogo.matricula;
            continue;
          }
          const plan = planejarEstudante({
            lidas: dialogo.lidas,
            etapa: plano.etapa,
            areas: plano.areas,
            excecoes: plano.excecoes.get(matricula) ?? [],
          });
          await escreverConceitos(page, plan.escritas);
          estado.preenchidos.push({
            matricula,
            nome,
            escritas: plan.escritas.length,
            mantidos: plan.mantidos,
            jaPreenchidos: plan.jaPreenchidos.length,
          });
        }
      }

      emitir({ status: 'aguardando-auxiliar', atual: { matricula, nome } });
      const proxima = await esperarOutroEstudante(page, matricula, { intervaloMs, ociosoMs, signal });
      if (proxima === 'ocioso') {
        emitir({ status: 'interrompido', atual: null, erro: 'Nenhuma ficha foi salva por muito tempo.' });
        return estado;
      }
      atual = proxima;
      if (atual !== null) await waitForAjax(page).catch(() => {});
    }

    const todos = ativos.every((a) => tratados.has(a.matricula));
    emitir({ status: todos ? 'concluido' : 'interrompido', atual: null });
    return estado;
  } catch (error) {
    if (page.isClosed()) {
      emitir({ status: 'interrompido', atual: null });
    } else {
      emitir({ status: 'falhou', atual: null, erro: error instanceof Error ? error.message : String(error) });
    }
    return estado;
  }
}

export class PreenchimentoEmAndamentoError extends Error {
  constructor() {
    super('Já há um preenchimento da ficha de desempenho em andamento nesta turma.');
    this.name = 'PreenchimentoEmAndamentoError';
  }
}

/** The runs of this process, by caderneta and turma. In memory: a run dies with its window. */
const execucoes = new Map<string, EstadoDoPreenchimento>();

/**
 * Starts a run in the background and returns its first state. A run that
 * throws ends as `falhou`, so its state always settles.
 */
export function iniciarPreenchimento(
  chave: string,
  inicial: EstadoDoPreenchimento,
  trabalho: (onEstado: (estado: EstadoDoPreenchimento) => void) => Promise<EstadoDoPreenchimento>,
): EstadoDoPreenchimento {
  const atual = execucoes.get(chave);
  if (atual && EM_ANDAMENTO.includes(atual.status)) throw new PreenchimentoEmAndamentoError();

  execucoes.set(chave, inicial);
  trabalho((estado) => execucoes.set(chave, estado))
    .then((final) => execucoes.set(chave, final))
    .catch((error: unknown) => {
      execucoes.set(chave, {
        ...(execucoes.get(chave) ?? inicial),
        status: 'falhou',
        atual: null,
        erro: error instanceof Error ? error.message : String(error),
      });
    });

  return inicial;
}

export function estadoDoPreenchimento(chave: string): EstadoDoPreenchimento | null {
  return execucoes.get(chave) ?? null;
}
