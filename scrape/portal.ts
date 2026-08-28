import { expect, type Locator, type Page } from '@playwright/test';
import { fillField, selectMenuOption, waitForAjax, AJAX_TIMEOUT_MS } from './primefaces';
import { LoginError, MissingAulaRowsError } from './errors';
import type {
  BatchResult,
  AulaBatch,
  AulaFailure,
  ProfessorCredenciais,
} from './types';

export const PORTAL_URL =
  'https://educacao.cloud.el.com.br/al-limoeirodeanadia-pm-edu/paginas/portalProfessor/index.xhtml';

const FIELD = {
  remedialClass: ':recuperacaoParalela-SOM-CP',
  guardianInteraction: ':iteracao-SOM-CP',
  curriculumCodes: ':codigoCurrilo',
  aulaPlan: ':desenvolvimento',
  homework: ':ferramentasUtilizadas',
} as const;

const FILTER = {
  term: ':etapaPeriodo-SOM-CP-OBR',
  classGroup: ':turma-SOM-CP-OBR',
  month: ':mes-SOM-CP-OBR',
} as const;

export async function login(
  page: Page,
  credentials: ProfessorCredenciais,
  portalUrl: string = PORTAL_URL,
): Promise<void> {
  await page.goto(portalUrl);

  await page.getByRole('textbox', { name: 'Usuário' }).fill(credentials.username);
  await page.getByRole('textbox', { name: 'Senha' }).fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  const schoolCell = page.getByRole('cell', { name: 'Escola' });

  try {
    await expect(schoolCell).toBeVisible({ timeout: AJAX_TIMEOUT_MS });
  } catch {
    throw new LoginError(
      'Login não foi bem-sucedido. Verifique suas credenciais e tente novamente.',
    );
  }

  await schoolCell.getByRole('button').click();
  await page.getByRole('option', { name: credentials.school, exact: true }).click();
  await waitForAjax(page);

  await page.locator('[id="j_idt65:j_idt68:periodoLetivo-SOM-CP-OBR_label"]').click();
  await page.getByRole('option', { name: '2026' }).click();

  waitForAjax(page);

  await page.getByRole('button', { name: ' Acessar' }).click();
}

export function findAulaRow(page: Page, date: string, order = 1): Locator {
  return page
    .locator('tr[data-ri]')
    .filter({ has: page.locator('span.texto1', { hasText: date }) })
    .filter({
      has: page.locator('span.texto1', { hasText: `Ordem da Aula: ${order}` }),
    });
}

export async function postAulaContent(
  page: Page,
  { term, classGroup, month, aulas }: AulaBatch,
): Promise<BatchResult> {
  if (aulas.length === 0) {
    throw new Error('No aulas provided.');
  }

  await page.getByRole('link', { name: 'Etapa' }).click();
  await page.getByRole('link', { name: 'Lançamento de Conteúdo' }).click();

  await selectMenuOption(page, page, FILTER.term, term);
  await selectMenuOption(page, page, FILTER.classGroup, classGroup);
  await selectMenuOption(page, page, FILTER.month, month);

  await expect(
    page.locator('tr[data-ri]').first(),
    'the diary table did not load',
  ).toBeVisible({ timeout: AJAX_TIMEOUT_MS });

  const unmatched: string[] = [];
  for (const aula of aulas) {
    const count = await findAulaRow(page, aula.date, aula.order ?? 1).count();
    if (count !== 1) unmatched.push(`${aula.date} (${count} linhas encontradas)`);
  }
  if (unmatched.length > 0) {
    throw new MissingAulaRowsError(unmatched);
  }

  const succeeded: string[] = [];
  const failed: AulaFailure[] = [];

  for (const aula of aulas) {
    const label = `${aula.date} #${aula.order ?? 1}`;
    try {
      const row = findAulaRow(page, aula.date, aula.order ?? 1);

      await selectMenuOption(page, row, FIELD.remedialClass, aula.remedialClass);
      await selectMenuOption(page, row, FIELD.guardianInteraction, aula.guardianInteraction);

      await fillField(page, row, FIELD.curriculumCodes, aula.curriculumCodes);
      await fillField(page, row, FIELD.aulaPlan, aula.aulaPlan);

      await fillField(page, row, FIELD.homework, aula.homework);

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