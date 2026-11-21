import { expect, type Page } from '@playwright/test';

import type { AreaDeConhecimento, Conceito, EstruturaDaFicha } from '../../shared/ficha-de-desempenho';
import type { Escrita, HabilidadeLida } from '../fichas/regras';
import { FichaNaoSuportadaError } from './errors';
import { ETAPA_MENU_NAME, filtroDeTurma, selecionarPeriodoLetivo } from './portal';
import { AJAX_TIMEOUT_MS, readMenuOptions, selectMenuOption, waitForAjax } from './primefaces';

/**
 * The _Ficha Desempenho_ screen and its per-estudante dialog. Selectors and
 * timings are mapped in `.scratch/ficha-de-desempenho/tela-do-portal.md`.
 */

const FICHA = ':fichaDesempenho-SOM-CP-OBR';
const MATRICULA_DO_DIALOGO = '[id$="matriculaAluno-CP-UP"]';
const SELECT = '[id$=":somRespostas_input"]';
/** The portal spends ~9 s of server time opening a large ficha. */
const ABRIR_ESTUDANTE_TIMEOUT_MS = 90_000;

export interface DialogoDaFicha {
  matricula: string;
  areas: AreaDeConhecimento[];
  lidas: HabilidadeLida[];
}

/** Opens _Ficha Desempenho_ on the turma and its ficha; returns the ficha's name. */
export async function abrirFichaDaTurma(
  page: Page,
  { periodoLetivo, turma }: { periodoLetivo?: string; turma: string },
): Promise<string> {
  await selecionarPeriodoLetivo(page, periodoLetivo);
  await page.getByRole('link', { name: ETAPA_MENU_NAME }).click();
  await page.getByRole('link', { name: 'Ficha Desempenho' }).click();
  await waitForAjax(page);

  await selectMenuOption(page, page, await filtroDeTurma(page), turma);

  const [ficha] = await readMenuOptions(page, FICHA);
  if (!ficha) throw new Error(`O portal não oferece ficha de desempenho para ${turma}.`);

  await selectMenuOption(page, page, FICHA, ficha);
  await waitForAjax(page);

  return ficha;
}

/** The second cell of every list row without its reflow column title; '' for other rows. */
async function matriculasDaLinhas(page: Page): Promise<string[]> {
  return page.locator('tr[data-ri]').evaluateAll((linhas) =>
    linhas.map((linha) => {
      const celula = linha.querySelectorAll(':scope > td')[1];
      const clone = celula?.cloneNode(true) as HTMLElement | undefined;
      clone?.querySelectorAll('.ui-column-title').forEach((titulo) => titulo.remove());
      const texto = (clone?.textContent ?? '').replace(/\s+/g, '');
      return /^\d+$/.test(texto) ? texto : '';
    }),
  );
}

/** The matrícula of each row of the list, in the portal's order. */
export async function matriculasDaLista(page: Page): Promise<string[]> {
  return (await matriculasDaLinhas(page)).filter(Boolean);
}

/** Clicks the estudante's Cadastrar/Avaliar and waits until their dialog is ready. */
export async function abrirEstudanteDaLista(page: Page, matricula: string): Promise<void> {
  // The matrícula cell also holds the reflow column title, so the row is
  // found by the same reading as `matriculasDaLista`, not by the cell's text.
  const indice = (await matriculasDaLinhas(page)).indexOf(matricula);
  if (indice < 0) throw new Error(`A matrícula ${matricula} não está na lista da ficha.`);
  const linha = page.locator('tr[data-ri]').nth(indice);

  await linha.locator('button').filter({ hasText: /Cadastrar|Avaliar/ }).first().click();
  await expect(page.locator(MATRICULA_DO_DIALOGO)).toHaveValue(matricula, {
    timeout: ABRIR_ESTUDANTE_TIMEOUT_MS,
  });
  await page.locator(SELECT).first().waitFor({ state: 'attached', timeout: AJAX_TIMEOUT_MS });
  await waitForAjax(page);
}

/** The matrícula in the open dialog, or null when no dialog is showing. */
export async function matriculaDoDialogo(page: Page): Promise<string | null> {
  const campo = page.locator(MATRICULA_DO_DIALOGO);
  if ((await campo.count()) === 0 || !(await campo.first().isVisible())) return null;
  const valor = (await campo.first().inputValue()).trim();
  return valor === '' ? null : valor;
}

const CONCEITO_DA_OPCAO = /^(R|RD|NR) - /;

/** Reads the open dialog: áreas, habilidades and the conceito of every etapa. */
export async function lerDialogoDaFicha(page: Page): Promise<DialogoDaFicha> {
  const matricula = (await page.locator(MATRICULA_DO_DIALOGO).first().inputValue()).trim();

  const lido = await page.evaluate((seletor) => {
    const areas: { indice: number; titulo: string; habilidades: { indice: number; numero: string; texto: string }[] }[] = [];
    const lidas: { area: number; habilidade: number; etapa: number; opcao: string | null }[] = [];
    const opcoesEstranhas = new Set<string>();
    const conceitoDa = /^(R|RD|NR) - /;

    for (const tabela of Array.from(document.querySelectorAll('[id$=":dtlistConceitoFichaVo"]'))) {
      const area = Number(/:(\d+):dtlistConceitoFichaVo$/.exec(tabela.id)?.[1]);
      const celula = tabela.parentElement;
      const titulo = (celula?.querySelector(':scope > div > span')?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const habilidades: { indice: number; numero: string; texto: string }[] = [];

      for (const linha of Array.from(tabela.querySelectorAll(':scope tbody[id$=":dtlistConceitoFichaVo_data"] > tr'))) {
        const descricao = (linha.querySelector(':scope > td')?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const select = linha.querySelector(seletor);
        const indice = Number(/dtlistConceitoFichaVo:(\d+):dtdatamodel/.exec(select?.id ?? '')?.[1]);
        if (!select || Number.isNaN(indice)) continue;
        const partes = /^(\d+\s*°)\s*(.*)$/.exec(descricao);
        habilidades.push({ indice, numero: (partes?.[1] ?? '').replace(/\s+/g, ''), texto: partes?.[2] ?? descricao });

        for (const el of Array.from(linha.querySelectorAll(seletor))) {
          const sel = el as HTMLSelectElement;
          const etapa = Number(/dtdatamodel:\d+:[^:]+:(\d+):/.exec(sel.id)?.[1]);
          for (const opcao of Array.from(sel.options).slice(1)) {
            if (!conceitoDa.test(opcao.text.trim())) opcoesEstranhas.add(opcao.text.trim());
          }
          const escolhida = sel.selectedIndex > 0 ? sel.options[sel.selectedIndex].text.trim() : null;
          lidas.push({ area, habilidade: indice, etapa, opcao: escolhida });
        }
      }

      areas.push({ indice: area, titulo, habilidades });
    }

    return { areas, lidas, opcoesEstranhas: [...opcoesEstranhas] };
  }, SELECT);

  if (lido.opcoesEstranhas.length > 0) throw new FichaNaoSuportadaError(lido.opcoesEstranhas);

  const porHabilidade = new Map<string, HabilidadeLida>();
  for (const { area, habilidade, etapa, opcao } of lido.lidas) {
    const chave = `${area}.${habilidade}`;
    const atual = porHabilidade.get(chave) ?? { area, habilidade, conceitos: { 1: null, 2: null, 3: null, 4: null } };
    if (etapa >= 1 && etapa <= 4) {
      atual.conceitos[etapa as 1 | 2 | 3 | 4] = opcao ? (CONCEITO_DA_OPCAO.exec(opcao)![1] as Conceito) : null;
    }
    porHabilidade.set(chave, atual);
  }

  return { matricula, areas: lido.areas, lidas: [...porHabilidade.values()] };
}

/**
 * Writes conceitos straight into the dialog's selects, without their AJAX
 * `onchange`: the portal's Salvar submits the whole form, so the values are
 * saved when the auxiliar de ensino saves. Never saves.
 */
export async function escreverConceitos(page: Page, escritas: readonly Escrita[]): Promise<void> {
  if (escritas.length === 0) return;

  const faltando = await page.evaluate((itens) => {
    const ausentes: string[] = [];
    for (const { area, habilidade, etapa, conceito } of itens) {
      const sufixo = `:${area}:dtlistConceitoFichaVo:${habilidade}:dtdatamodel:`;
      const sel = Array.from(document.querySelectorAll<HTMLSelectElement>('[id$=":somRespostas_input"]')).find(
        (el) => el.id.includes(sufixo) && new RegExp(`dtdatamodel:\\d+:[^:]+:${etapa}:`).test(el.id),
      );
      const opcao = sel && Array.from(sel.options).find((o) => o.text.trim().startsWith(`${conceito} - `));
      if (!sel || !opcao) {
        ausentes.push(`${area}.${habilidade}.${etapa}`);
        continue;
      }
      sel.value = opcao.value;
      const label = document.getElementById(sel.id.replace(/_input$/, '_label'));
      if (label) label.textContent = opcao.text;
    }
    return ausentes;
  }, escritas);

  if (faltando.length > 0) {
    throw new Error(`Campos da ficha não encontrados: ${faltando.join(', ')}.`);
  }
}

/** Closes the dialog with Fechar, discarding anything unsaved. */
export async function fecharDialogo(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Fechar' }).first().click();
  await waitForAjax(page);
}

/**
 * The áreas and habilidades of the turma's ficha. They are the same for every
 * estudante, so the first one's dialog is read and closed without saving.
 */
export async function lerEstruturaDaFicha(
  page: Page,
  filtro: { periodoLetivo?: string; turma: string },
): Promise<Omit<EstruturaDaFicha, 'lidaEm'>> {
  const ficha = await abrirFichaDaTurma(page, filtro);
  const [primeira] = await matriculasDaLista(page);
  if (!primeira) throw new Error(`A ficha de ${filtro.turma} não lista nenhum estudante.`);

  await abrirEstudanteDaLista(page, primeira);
  const { areas } = await lerDialogoDaFicha(page);
  await fecharDialogo(page);

  return { ficha, areas };
}
