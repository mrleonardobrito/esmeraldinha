import { expect, type Locator, type Page } from '@playwright/test';
import { fillField, selectMenuOption, waitForAjax, AJAX_TIMEOUT_MS } from './primefaces';
import { LoginError, MissingAulaRowsError } from './errors';
import type {
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

  waitForAjax(page);

  await page.getByRole('button', { name: ' Acessar' }).click();
}

export function findAulaRow(page: Page, date: string, ordem = 1): Locator {
  return page
    .locator('tr[data-ri]')
    .filter({ has: page.locator('span.texto1', { hasText: date }) })
    .filter({
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

  await page.getByRole('link', { name: 'Etapa' }).click();
  await page.getByRole('link', { name: 'Lançamento de Conteúdo' }).click();

  await selectMenuOption(page, page, FILTER.etapa, etapa);
  await selectMenuOption(page, page, FILTER.turma, turma);
  await selectMenuOption(page, page, FILTER.mes, mes);

  await expect(
    page.locator('tr[data-ri]').first(),
    'the diary table did not load',
  ).toBeVisible({ timeout: AJAX_TIMEOUT_MS });

  const unmatched: string[] = [];
  for (const aula of aulas) {
    const count = await findAulaRow(page, aula.data, aula.ordem ?? 1).count();
    if (count !== 1) unmatched.push(`${aula.data} (${count} linhas encontradas)`);
  }
  if (unmatched.length > 0) {
    throw new MissingAulaRowsError(unmatched);
  }

  const succeeded: string[] = [];
  const failed: AulaFailure[] = [];

  for (const aula of aulas) {
    const label = `${aula.data} #${aula.ordem ?? 1}`;
    try {
      const row = findAulaRow(page, aula.data, aula.ordem ?? 1);

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