import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { prepararAulaParaPreenchimento, prepararAulasParaPreenchimento } from '../portal';

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
    "><option value="1">${label}</option>${suffix.startsWith('mes-') ? '<option value="2">Setembro</option>' : ''}</select>
  </div>`;
}

async function createPortal(): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(2_000);
  page.setDefaultNavigationTimeout(2_000);
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
      <table><tbody>${[...dates, '09/09/2026'].map((data, index) => `
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
  const html = await page.content();
  await page.context().route('http://portal.example/diario', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto('http://portal.example/diario');
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
    await page.context().close();
  }
});

it('prepares all selected aulas with one call and leaves them unsaved for review', async () => {
  const page = await createPortal();
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  try {
    await prepararAulasParaPreenchimento(page, dates.map((data) => ({
      etapa: 'III ETAPA', turma, mes: 'Agosto', data, ordem: 5,
      conteudo: { codigoCR: `CR ${data}`, desenvolvimento: `Conteúdo ${data}`, ferramentas: 'Livro' },
    })));
    for (const [index, data] of dates.entries()) {
      expect(await page.locator(`[id="form:${index}:desenvolvimento"]`).inputValue()).toBe(`Conteúdo ${data}`);
    }
    expect(await page.locator('output').textContent()).toBe('1');
    expect(errors).toEqual([]);
  } finally { await page.context().close(); }
});

it('keeps different meses in separate tabs so changing filters preserves earlier unsaved aulas', async () => {
  const page = await createPortal();
  try {
    await prepararAulasParaPreenchimento(page, [
      { etapa: 'III ETAPA', turma, mes: 'Agosto', data: dates[0], ordem: 5, conteudo: { desenvolvimento: 'Agosto pending review' } },
      { etapa: 'III ETAPA', turma, mes: 'Setembro', data: '09/09/2026', ordem: 5, conteudo: { desenvolvimento: 'Setembro pending review' } },
    ]);
    const tabs = page.context().pages();
    expect(tabs).toHaveLength(2);
    expect(await tabs[0].locator('[id="form:0:desenvolvimento"]').inputValue()).toBe('Agosto pending review');
    expect(await tabs[1].locator('[id="form:3:desenvolvimento"]').inputValue()).toBe('Setembro pending review');
    expect(await tabs[0].locator('[id="form:mes-SOM-CP-OBR_input"]').inputValue()).toBe('1');
    expect(await tabs[1].locator('[id="form:mes-SOM-CP-OBR_input"]').inputValue()).toBe('2');
  } finally { await page.context().close(); }
});
