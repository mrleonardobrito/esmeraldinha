import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { FichaNaoSuportadaError } from '../errors';
import { escreverConceitos, lerDialogoDaFicha, matriculaDoDialogo } from '../ficha-de-desempenho';
import { dialogoDaFicha } from './fixtures/ficha-de-desempenho';

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const areas = [
  { titulo: 'O EU, O OUTRO E NÓS (EO) CRECHE-(1 ANO E 7 MESES A 3 ANOS E 11 MESES)', habilidades: ['Demonstra cuidado.', 'Comunica-se.'] },
  { titulo: 'CORPO, GESTOS E MOVIMENTOS (CG)', habilidades: ['Explora o espaço.', 'Imita gestos.'] },
];

async function pagina(html: string): Promise<Page> {
  const page = await browser.newPage();
  page.setDefaultTimeout(2_000);
  await page.setContent(html);
  return page;
}

it('lerDialogoDaFicha reads áreas, habilidades and existing conceitos', async () => {
  const page = await pagina(dialogoDaFicha({ matricula: '10315', areas, valores: { '0.1.1': 'R', '1.0.2': 'NR' } }));
  try {
    const dialogo = await lerDialogoDaFicha(page);

    expect(dialogo.matricula).toBe('10315');
    expect(dialogo.areas).toEqual([
      {
        indice: 0,
        titulo: areas[0].titulo,
        habilidades: [
          { indice: 0, numero: '1°', texto: 'Demonstra cuidado.' },
          { indice: 1, numero: '2°', texto: 'Comunica-se.' },
        ],
      },
      {
        indice: 1,
        titulo: areas[1].titulo,
        habilidades: [
          { indice: 0, numero: '1°', texto: 'Explora o espaço.' },
          { indice: 1, numero: '2°', texto: 'Imita gestos.' },
        ],
      },
    ]);
    expect(dialogo.lidas).toContainEqual({ area: 0, habilidade: 1, conceitos: { 1: 'R', 2: null, 3: null, 4: null } });
    expect(dialogo.lidas).toContainEqual({ area: 1, habilidade: 0, conceitos: { 1: null, 2: 'NR', 3: null, 4: null } });
    expect(dialogo.lidas).toHaveLength(4);
  } finally {
    await page.close();
  }
});

it('escreverConceitos sets value and label without firing change', async () => {
  const page = await pagina(dialogoDaFicha({ matricula: '10315', areas }));
  try {
    await escreverConceitos(page, [
      { area: 0, habilidade: 0, etapa: 1, conceito: 'RD' },
      { area: 1, habilidade: 1, etapa: 3, conceito: 'R' },
    ]);

    const dialogo = await lerDialogoDaFicha(page);
    expect(dialogo.lidas).toContainEqual({ area: 0, habilidade: 0, conceitos: { 1: 'RD', 2: null, 3: null, 4: null } });
    expect(dialogo.lidas).toContainEqual({ area: 1, habilidade: 1, conceitos: { 1: null, 2: null, 3: 'R', 4: null } });
    expect(await page.locator('[id$=":0:dtlistConceitoFichaVo:0:dtdatamodel:0:j_idt322:1:j_idt327:somRespostas_label"]').textContent())
      .toBe('RD - REALIZA COM DIFICULDADES');
    expect(await page.locator('#onchanges').textContent()).toBe('0');
  } finally {
    await page.close();
  }
});

it('refuses a ficha with other options', async () => {
  const page = await pagina(dialogoDaFicha({
    matricula: '10315',
    areas,
    opcoes: [['1', 'S - SIM'], ['2', 'N - NÃO']],
  }));
  try {
    await expect(lerDialogoDaFicha(page)).rejects.toBeInstanceOf(FichaNaoSuportadaError);
  } finally {
    await page.close();
  }
});

it('matriculaDoDialogo is null when no dialog is open', async () => {
  const page = await pagina('<main>lista</main>');
  try {
    expect(await matriculaDoDialogo(page)).toBeNull();
  } finally {
    await page.close();
  }
});
