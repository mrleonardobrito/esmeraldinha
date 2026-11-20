import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { openLancaConteudo } from '../portal';

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

it('opens Etapa with a dropdown icon without matching Resultado das Etapas', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <style>.fa-angle-down::before { content: '\\f107'; }</style>
      <a href="#" onclick="document.querySelector('section').hidden = false">
        <span>Etapa</span><i class="fa-angle-down"></i>
      </a>
      <a href="#">Resultado das Etapas</a>
      <section hidden>
        <a href="#" onclick="document.querySelector('output').textContent = 'opened'">
          Lançamento de Conteúdo
        </a>
      </section>
      <output></output>
    `);

    // This reproduces the portal's icon becoming part of the accessible name.
    expect(await page.getByRole('link', { name: 'Etapa', exact: true }).count()).toBe(0);
    await openLancaConteudo(page);
    expect(await page.locator('output').textContent()).toBe('opened');
  } finally {
    await page.close();
  }
});
