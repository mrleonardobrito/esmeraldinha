import { expect, type Locator, type Page } from '@playwright/test';
import { FieldTooLongError } from './errors';
import type { FieldStatus } from './types';

declare global {
  interface Window {
    PrimeFaces?: { ajax?: { Queue?: { isEmpty?: () => boolean } } };
    jQuery?: { active: number };
  }
}

export const AJAX_TIMEOUT_MS = 20_000;
export type Scope = Page | Locator;

export async function waitForAjax(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const queueDrained = window.PrimeFaces?.ajax?.Queue?.isEmpty?.() ?? true;
      const jqueryIdle = window.jQuery ? window.jQuery.active === 0 : true;
      return queueDrained && jqueryIdle;
    },
    undefined,
    { timeout: AJAX_TIMEOUT_MS },
  );

  await page.waitForTimeout(120);
}

export async function selectMenuOption(
  page: Page,
  scope: Scope,
  idSuffix: string,
  label?: string,
): Promise<FieldStatus> {
  if (!label) return 'skipped';

  const menu = scope.locator(`[id$="${idSuffix}"]`);
  await expect(menu, `menu ${idSuffix} not found`).toHaveCount(1);

  const isDisabled = await menu.evaluate((el: Element) =>
    el.classList.contains('ui-state-disabled'),
  );
  if (isDisabled) return 'disabled';

  const current = (await menu.locator('.ui-selectonemenu-label').innerText()).trim();
  if (current === label) return 'unchanged';

  await menu.click();

  const panel = page.locator('.ui-selectonemenu-panel:visible');
  await expect(panel, `panel for ${idSuffix} did not open`).toHaveCount(1);

  await panel.getByRole('option', { name: label, exact: true }).click();
  await waitForAjax(page);

  return 'updated';
}

export async function fillField(
  page: Page,
  scope: Scope,
  idSuffix: string,
  value?: string,
): Promise<FieldStatus> {
  if (value === undefined || value === null) return 'skipped';

  const field = scope.locator(`[id$="${idSuffix}"]`);
  await expect(field, `field ${idSuffix} not found`).toHaveCount(1);

  const maxAttr = await field.getAttribute('maxlength');
  const max = maxAttr ? Number(maxAttr) : Number.POSITIVE_INFINITY;
  if (value.length > max) {
    throw new FieldTooLongError(idSuffix, value.length, max);
  }

  if ((await field.inputValue()).trim() === value.trim()) return 'unchanged';

  await field.fill(value);
  await field.blur();
  await waitForAjax(page);

  return 'updated';
}
/**
 * O PrimeFaces mantém um <select> escondido junto de cada selectOneMenu.
 * Ler dele evita abrir o painel — sem clique, sem AJAX, sem corrida.
 */
export async function readMenuOptions(
  scope: Scope,
  idSuffix: string,
): Promise<string[]> {
  const select = scope.locator(`[id$="${idSuffix}_input"]`);
  await expect(select, `menu ${idSuffix} not found`).toHaveCount(1);

  const labels = await select.locator('option').allTextContents();

  return labels
    // A primeira opção do PrimeFaces é um espaço em branco — às vezes o
    // caractere, às vezes a entidade `&nbsp;` literal — e não é uma escolha.
    .map((label) => label.replace(/&nbsp;|&#160;/g, ' ').replace(/[\s\u00a0]+/g, ' ').trim())
    .filter((label) => label.length > 0 && !/^selecione/i.test(label));
}
