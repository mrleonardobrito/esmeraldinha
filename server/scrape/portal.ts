import { expect, type Locator, type Page } from '@playwright/test';
import {
  fillField,
  readMenuOptions,
  selectMenuOption,
  waitForAjax,
  AJAX_TIMEOUT_MS,
} from './primefaces';
import { LoginError, MissingAulaRowsError } from './errors';
import type {
  ConteudoCatalogo,
  EtapaOptions,
  LancaConteudoFilter,
  AulaFailure,
  ProfessorCredenciais,
  WriteResult,
} from './types';

export const PORTAL_URL =
  'https://educacao.cloud.el.com.br/al-limoeirodeanadia-pm-edu/paginas/portalProfessor/index.xhtml';

const FIELD = {
  isRecuperacao: ':recuperacaoParalela-SOM-CP',
  isInteracao: ':iteracao-SOM-CP',
  codigoCR: ':codigoCurrilo',
  desenvolvimento: ':desenvolvimento',
  ferramentas: ':ferramentasUtilizadas',
} as const;

const FILTER = {
  etapa: ':etapaPeriodo-SOM-CP-OBR',
  turma: ':turma-SOM-CP-OBR',
  /** O portal chama a redução de _Grupo diário_. */
  reducao: ':grupoDiario-SOM-CP-OBR',
  mes: ':mes-SOM-CP-OBR',
} as const;

export async function login(
  page: Page,
  credentials: ProfessorCredenciais,
  portalUrl: string = PORTAL_URL,
): Promise<void> {
  await page.goto(portalUrl);

  await page.getByRole('textbox', { name: 'Usuário' }).fill(credentials.login);
  await page.getByRole('textbox', { name: 'Senha' }).fill(credentials.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();

  const escolaCell = page.getByRole('cell', { name: 'Escola' });

  try {
    await expect(escolaCell).toBeVisible({ timeout: AJAX_TIMEOUT_MS });
  } catch {
    throw new LoginError(
      'Login não foi bem-sucedido. Verifique suas credenciais e tente novamente.',
    );
  }

  await escolaCell.getByRole('button').click();
  await page.getByRole('option', { name: credentials.escola, exact: true }).click();
  await waitForAjax(page);

  await page.locator('[id*="periodoLetivo-SOM-CP-OBR_label"]').click();
  await page.getByRole('option', { name: '2026' }).click();

  await waitForAjax(page);

  await page.getByRole('button', { name: ' Acessar' }).click();
}

export async function openLancaConteudo(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Etapa' }).click();
  await page.getByRole('link', { name: 'Lançamento de Conteúdo' }).click();
  await waitForAjax(page);
}

/**
 * As opções válidas do professor, para que o agente escolha entre elas em vez
 * de inventar uma turma. A etapa manda: o portal recarrega turmas e meses a
 * cada troca, então cada etapa é selecionada uma vez.
 */
export async function listConteudoOptions(page: Page): Promise<ConteudoCatalogo> {
  await openLancaConteudo(page);

  const nomes = await readMenuOptions(page, FILTER.etapa);
  const etapas: EtapaOptions[] = [];

  for (const nome of nomes) {
    await selectMenuOption(page, page, FILTER.etapa, nome);

    const turmas = await readMenuOptions(page, FILTER.turma);

    // Os meses só carregam depois da turma e da redução. São os meses do
    // calendário da etapa, iguais para todas as turmas dela, então basta
    // escolher a primeira.
    if (turmas[0]) {
      await selectMenuOption(page, page, FILTER.turma, turmas[0]);
      await selectFirstReducao(page);
    }

    etapas.push({
      nome,
      turmas,
      meses: turmas[0] ? await readMenuOptions(page, FILTER.mes) : [],
    });
  }

  return { etapas };
}

/**
 * A ordem da aula é do portal, não do plano do professor: quem a define é o
 * grupo diário da turma. Só filtramos por ela quando o material a informa —
 * do contrário, a data sozinha já identifica a linha.
 */
/**
 * A redução não vem do material do professor: é o grupo diário sob o qual a
 * turma arquiva suas aulas. Ficamos com a primeira opção, que é a que o portal
 * usa para a turma.
 */
export async function selectFirstReducao(page: Page): Promise<string | undefined> {
  const [primeira] = await readMenuOptions(page, FILTER.reducao);

  if (!primeira) return undefined;

  await selectMenuOption(page, page, FILTER.reducao, primeira);

  return primeira;
}

export function findAulaRow(page: Page, date: string, ordem?: number): Locator {
  const byDate = page
    .locator('tr[data-ri]')
    .filter({ has: page.locator('span.texto1', { hasText: date }) });

  if (ordem === undefined) return byDate;

  return byDate.filter({
    has: page.locator('span.texto1', { hasText: `Ordem da Aula: ${ordem}` }),
  });
}

export async function postAulaContent(
  page: Page,
  { etapa, turma, mes, aulas }: LancaConteudoFilter,
): Promise<WriteResult> {
  if (aulas.length === 0) {
    throw new Error('No aulas provided.');
  }

  await openLancaConteudo(page);

  await selectMenuOption(page, page, FILTER.etapa, etapa);
  await selectMenuOption(page, page, FILTER.turma, turma);
  await selectFirstReducao(page);
  await selectMenuOption(page, page, FILTER.mes, mes);

  await expect(
    page.locator('tr[data-ri]').first(),
    'the diary table did not load',
  ).toBeVisible({ timeout: AJAX_TIMEOUT_MS });

  const unmatched: string[] = [];
  for (const aula of aulas) {
    const count = await findAulaRow(page, aula.data, aula.ordem).count();
    if (count !== 1) {
      unmatched.push(
        count === 0
          ? `${aula.data} (nenhuma linha)`
          : `${aula.data} (${count} linhas — informe a ordem da aula)`,
      );
    }
  }
  if (unmatched.length > 0) {
    throw new MissingAulaRowsError(unmatched);
  }

  const succeeded: string[] = [];
  const failed: AulaFailure[] = [];

  for (const aula of aulas) {
    const label = aula.ordem === undefined ? aula.data : `${aula.data} #${aula.ordem}`;
    try {
      const row = findAulaRow(page, aula.data, aula.ordem);

      await selectMenuOption(page, row, FIELD.isRecuperacao, aula.isRecuperacao);
      await selectMenuOption(page, row, FIELD.isInteracao, aula.isInteracao);

      await fillField(page, row, FIELD.codigoCR, aula.codigoCR);
      await fillField(page, row, FIELD.desenvolvimento, aula.desenvolvimento);

      await fillField(page, row, FIELD.ferramentas, aula.ferramentas);

      succeeded.push(label);
    } catch (error: unknown) {
      failed.push({
        aula: label,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // TODO: Adicionar botão "Salvar" e clicar nele, se necessário. Atualmente, o portal salva automaticamente.
  
  return { succeeded, failed };
}