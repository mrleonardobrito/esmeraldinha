import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readMenuOptions, selectMenuOption } from '../primefaces';

/**
 * O `selectOneMenu` do PrimeFaces como ele chega na página: um `<select>`
 * `aria-hidden`, fora da tela, e ao lado dele o rótulo visível que o portal
 * atualiza no `change`. É essa invisibilidade que derrubava a raspagem.
 */
const MENU = `
  <style>
    .escondido {
      position: absolute;
      left: -9999px;
      visibility: hidden;
    }
  </style>
  <div id="form:etapaPeriodo-SOM-CP-OBR" class="ui-selectonemenu">
    <span class="ui-selectonemenu-label">Selecione</span>
    <select
      id="form:etapaPeriodo-SOM-CP-OBR_input"
      class="escondido"
      tabindex="-1"
      aria-hidden="true"
      onchange="
        document.querySelector('.ui-selectonemenu-label').textContent =
          this.options[this.selectedIndex].text;
      "
    >
      <option value="">&nbsp;</option>
      <option value="1">1ª Etapa</option>
      <option value="2">2ª Etapa</option>
    </select>
  </div>
`;

const ETAPA = ':etapaPeriodo-SOM-CP-OBR';

describe('selectMenuOption', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.setContent(MENU);
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('lê as opções do select escondido, sem a opção em branco', async () => {
    expect(await readMenuOptions(page, ETAPA)).toEqual(['1ª Etapa', '2ª Etapa']);
  });

  it('escolhe uma opção mesmo com o select invisível', async () => {
    expect(await selectMenuOption(page, page, ETAPA, '2ª Etapa')).toBe('updated');

    // O rótulo só muda se o `change` tiver disparado: é ele que o portal ouve.
    expect(await page.locator('.ui-selectonemenu-label').innerText()).toBe('2ª Etapa');
  });

  it('não mexe no menu quando a opção pedida já é a atual', async () => {
    expect(await selectMenuOption(page, page, ETAPA, '2ª Etapa')).toBe('unchanged');
  });

  it('recusa uma opção que o menu não oferece, listando as que existem', async () => {
    const erro = await selectMenuOption(page, page, ETAPA, '5ª Etapa').catch(
      (error: unknown) => error,
    );

    expect(erro).toMatchObject({
      name: 'OptionNotFoundError',
      label: '5ª Etapa',
      disponiveis: ['1ª Etapa', '2ª Etapa'],
    });
  });
});
