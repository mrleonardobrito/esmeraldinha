import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { prepararAulaParaPreenchimento } from '../portal';

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const dates = ['05/08/2026', '12/08/2026', '19/08/2026'];
const turma = '1º ANO - 1º ANO D - INTEGRAL';

function menu(suffix: string, label: string) {
  return `<div id="form:${suffix}" class="ui-selectonemenu">
    <span class="ui-selectonemenu-label">${suffix.startsWith('turma-') ? label.replace(' - INTEGRAL', '  - INTEGRAL') : label}</span>
    <select id="form:${suffix}_input" onchange="
      document.querySelector('main tbody').innerHTML = document.querySelector('template').content.querySelector('tbody').innerHTML;
    "><option value="1">${label}</option></select>
  </div>`;
}

async function createPortal(): Promise<Page> {
  const page = await browser.newPage();
  // Reopening Lançamento de Conteúdo restores the saved (empty) form, just
  // like the real portal. Unsaved fields live only in the current table.
  await page.setContent(`
    <a href="#">Etapa</a>
    <a href="#" onclick="
      document.querySelector('main').innerHTML = document.querySelector('template').innerHTML;
      document.querySelector('output').value++;
    ">Lançamento de Conteúdo</a>
    <button onclick="throw new Error('Saving must remain a manual action')">Salvar</button>
    <output>0</output>
    <main></main>
    <template>
      ${menu('etapaPeriodo-SOM-CP-OBR', 'III ETAPA')}
      ${menu('turma-SOM-CP-OBR', turma)}
      ${menu('grupoDiario-SOM-CP-OBR', 'Regular')}
      ${menu('mes-SOM-CP-OBR', 'Agosto')}
      <table><tbody>${dates.map((data, index) => `
        <tr data-ri="${index}"><td>
          <span class="texto1">${data}</span>
          <span class="texto1">Ordem da Aula: 5</span>
          <textarea id="form:${index}:codigoCurrilo"></textarea>
          <textarea id="form:${index}:desenvolvimento"></textarea>
          <textarea id="form:${index}:ferramentasUtilizadas"></textarea>
        </td></tr>
      `).join('')}</tbody></table>
    </template>
  `);
  return page;
}

it('keeps unsaved conteúdo and manual edits when advancing through three aulas in the same mês', async () => {
  const page = await createPortal();
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  try {
    for (const [index, data] of dates.entries()) {
      await prepararAulaParaPreenchimento(page, {
        etapa: 'III ETAPA', turma, mes: 'Agosto', data, ordem: 5,
        conteudo: {
          codigoCR: `CR ${index}`,
          desenvolvimento: `Desenvolvimento ${data}`,
          ferramentas: `Ferramentas ${index}`,
        },
      });
      if (index === 0) {
        await page.locator('[id="form:0:desenvolvimento"]').fill('Manually reviewed conteúdo');
      }
    }

    for (const [index, data] of dates.entries()) {
      expect(await page.locator(`[id="form:${index}:codigoCurrilo"]`).inputValue()).toBe(`CR ${index}`);
      expect(await page.locator(`[id="form:${index}:desenvolvimento"]`).inputValue())
        .toBe(index === 0 ? 'Manually reviewed conteúdo' : `Desenvolvimento ${data}`);
      expect(await page.locator(`[id="form:${index}:ferramentasUtilizadas"]`).inputValue()).toBe(`Ferramentas ${index}`);
    }
    expect(await page.locator('output').textContent()).toBe('1');
    expect(pageErrors).toEqual([]);
  } finally {
    await page.close();
  }
});
