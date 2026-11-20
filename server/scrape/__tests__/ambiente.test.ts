import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { listPeriodosLetivos, selecionarPeriodoLetivo } from '../portal';

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

it('accesses and switches períodos letivos without opening a stuck animated overlay', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <nav class="poseidon-menu">
        <a class="ui-commandlink" href="#" onclick="document.querySelector('#dialogConfiguracoesAmbiente').hidden=false">
          Configurações de ambiente
        </a>
      </nav>
      <div id="dialogConfiguracoesAmbiente" hidden>
        <div id="form:periodoLetivo-SOM-CP-OBR" class="ui-selectonemenu">
          <span id="form:periodoLetivo-SOM-CP-OBR_label" class="ui-selectonemenu-label"
            onclick="document.querySelector('[role=listbox]').hidden=false">Selecione</span>
          <select id="form:periodoLetivo-SOM-CP-OBR_input" style="display:none" onchange="
            document.getElementById('form:periodoLetivo-SOM-CP-OBR_label').textContent=this.selectedOptions[0].text;
          ">
            <option value="">&nbsp;</option>
            <option value="regular">2026</option>
            <option value="eja">2026 EJA</option>
          </select>
        </div>
        <button onclick="
          document.querySelector('output').textContent=document.querySelector('select').value;
          document.querySelector('#dialogConfiguracoesAmbiente').hidden=true;
        ">Acessar</button>
      </div>
      <div id="form:periodoLetivo-SOM-CP-OBR_panel" role="listbox" hidden
        style="position:fixed;inset:0;background:white;z-index:9999">
        <div role="option" onclick="document.querySelector('select').value='regular'">2026</div>
        <div role="option" onclick="document.querySelector('select').value='eja'">2026 EJA</div>
      </div>
      <output></output>
    `);

    expect(await listPeriodosLetivos(page)).toEqual(['2026', '2026 EJA']);
    expect(await page.locator('output').textContent()).toBe('regular');
    await selecionarPeriodoLetivo(page, '2026 EJA');
    expect(await page.locator('output').textContent()).toBe('eja');
    expect(await page.getByRole('listbox', { includeHidden: true }).isVisible()).toBe(false);
  } finally {
    await page.close();
  }
});
