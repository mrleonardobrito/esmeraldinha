import { expect, type Locator, type Page } from '@playwright/test';
import { FieldTooLongError, OptionNotFoundError } from './errors';
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

/**
 * Escolhe uma opção num `selectOneMenu` do PrimeFaces.
 *
 * O caminho normal é o `<select>` escondido que acompanha cada menu: o próprio
 * portal registra um `onchange` nele que dispara o AJAX (`PrimeFaces.ab`), o
 * mesmo que o clique no painel dispararia. Mexer nele dispensa abrir o painel
 * — e é o painel que não abre quando a página ainda está trocando de tela,
 * origem do "panel did not open" que derrubava a raspagem.
 *
 * O clique continua existindo como plano B, para o caso de um menu cujo
 * `<select>` não esteja lá.
 */
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

  // A troca de tela precisa ter terminado antes de mexer no menu, seja qual
  // for o caminho: um `<select>` que ainda vai ser substituído não adianta.
  await waitForAjax(page);

  const select = scope.locator(`[id$="${idSuffix}_input"]`);

  if ((await select.count()) === 1) {
    await selecionarPeloSelect(page, select, label);

    return 'updated';
  }

  await selecionarPeloPainel(page, menu, idSuffix, label);

  return 'updated';
}

/**
 * Escolhe pelo `<select>` escondido.
 *
 * O `selectOption` do Playwright não serve aqui: ele exige que o elemento
 * esteja visível, e este `<select>` nasce `aria-hidden` — o PrimeFaces o
 * mantém fora da tela de propósito, então a espera só termina em timeout.
 * Por isso o valor é escrito direto no DOM.
 *
 * Escrever o valor sozinho também não basta: o PrimeFaces só reage ao evento,
 * e o rótulo visível continuaria mostrando a opção antiga.
 */
async function selecionarPeloSelect(
  page: Page,
  select: Locator,
  label: string,
): Promise<void> {
  // Em caso de falha o retorno j\u00e1 traz as op\u00e7\u00f5es que o DOM tinha no momento
  // exato da tentativa: uma nova leitura depois correria o risco de pegar um
  // menu que j\u00e1 recarregou por causa de outra troca de tela.
  const resultado = await select.evaluate((el, alvo) => {
    const campo = el as HTMLSelectElement;
    const normaliza = (texto: string) =>
      texto.replace(/&nbsp;|&#160;/g, ' ').replace(/[\s\u00a0]+/g, ' ').trim();

    const opcao = Array.from(campo.options).find(
      (candidata) => normaliza(candidata.text) === alvo,
    );

    if (!opcao) {
      return {
        escolheu: false as const,
        disponiveis: Array.from(campo.options)
          .map((candidata) => normaliza(candidata.text))
          .filter((texto) => texto.length > 0),
      };
    }

    campo.value = opcao.value;
    campo.dispatchEvent(new Event('change', { bubbles: true }));

    return { escolheu: true as const };
  }, label);

  if (!resultado.escolheu) {
    throw new OptionNotFoundError(label, resultado.disponiveis);
  }

  await waitForAjax(page);
}

/**
 * O caminho antigo: abre o painel e clica na opção. Fica para os menus sem
 * `<select>` por trás, e tenta de novo quando o painel não abre de primeira.
 */
async function selecionarPeloPainel(
  page: Page,
  menu: Locator,
  idSuffix: string,
  label: string,
): Promise<void> {
  await menu.scrollIntoViewIfNeeded().catch(() => {});

  const panel = page.locator('.ui-selectonemenu-panel:visible');

  for (let tentativa = 1; ; tentativa += 1) {
    await menu.click();

    try {
      await expect(panel, `panel for ${idSuffix} did not open`).toHaveCount(1, {
        timeout: 5_000,
      });
      break;
    } catch (error) {
      if (tentativa >= 3) throw error;

      // O clique pode ter aberto e fechado o painel; a tecla o fecha de vez
      // para a próxima tentativa começar do mesmo lugar.
      await page.keyboard.press('Escape').catch(() => {});
      await waitForAjax(page);
    }
  }

  await panel.getByRole('option', { name: label, exact: true }).click();
  await waitForAjax(page);
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
