import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { fichaInicial, type Excecao, type IndiceDaEtapa } from '../../../shared/ficha-de-desempenho';
import { portalDaFicha } from '../../scrape/__tests__/fixtures/ficha-de-desempenho';
import {
  acompanharPreenchimento,
  type EstadoDoPreenchimento,
  type PlanoDoPreenchimento,
} from '../preenchimento-assistido';

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const turma = 'CRECHE II - CRECHE II - VESPERTINO';
const areas = [
  { titulo: 'O EU, O OUTRO E NÓS (EO)', habilidades: ['Demonstra cuidado.', 'Comunica-se.'] },
  { titulo: 'CORPO, GESTOS E MOVIMENTOS (CG)', habilidades: ['Explora o espaço.'] },
];
const estudantes = [
  { matricula: '101', nome: 'ANA', situacao: 'ATIVO' },
  { matricula: '102', nome: 'BRUNO', situacao: 'TRANSFERIDO' },
  { matricula: '103', nome: 'CAIO', situacao: 'ATIVO' },
];

const estruturaLida = areas.map((area, indice) => ({
  indice,
  titulo: area.titulo,
  habilidades: area.habilidades.map((texto, h) => ({ indice: h, numero: `${h + 1}°`, texto })),
}));

/** R in the given etapas of área 0 for everyone, with per-matrícula overrides. */
function plano(
  excecoes: Map<string, Excecao[]> = new Map(),
  etapas: IndiceDaEtapa[] = [1],
): PlanoDoPreenchimento {
  const fichas = new Map(estudantes.map((e) => [
    e.matricula,
    fichaInicial([estruturaLida[0]], etapas, excecoes.get(e.matricula) ?? []),
  ]));
  return { turma, etapas, rotuloDasEtapas: 'I ETAPA', areas: [0], estudantes, fichas, estrutura: estruturaLida };
}

async function portal(): Promise<Page> {
  const page = await browser.newPage();
  page.setDefaultTimeout(3_000);
  await page.setContent(portalDaFicha({ turma, ficha: 'FICHA - Todas disciplinas', estudantes, areas }));
  return page;
}

/** Runs the assisted fill and lets the test act as the auxiliar between states. */
function executar(page: Page, p: PlanoDoPreenchimento) {
  const estados: EstadoDoPreenchimento[] = [];
  const ouvintes: (() => void)[] = [];
  const fim = acompanharPreenchimento(page, p, (estado) => {
    estados.push(estado);
    ouvintes.splice(0).forEach((ouvir) => ouvir());
  }, { intervaloMs: 50, ociosoMs: 5_000 });

  async function aguardandoEm(matricula: string): Promise<void> {
    while (!estados.some((e) => e.status === 'aguardando-auxiliar' && e.atual?.matricula === matricula)) {
      await new Promise<void>((resolve, reject) => {
        ouvintes.push(resolve);
        setTimeout(() => reject(new Error(`never waited on ${matricula}`)), 5_000);
      });
    }
    estados.length = 0;
  }

  return { fim, aguardandoEm };
}

const salvos = (page: Page) => page.evaluate(() => (window as unknown as { __salvos: Record<string, Record<string, string>> }).__salvos);
const cliques = (page: Page) => page.evaluate(() => (window as unknown as { __cliques: string[] }).__cliques);

it('fills each estudante as the auxiliar clicks Salvar e próximo', async () => {
  const page = await portal();
  const { fim, aguardandoEm } = executar(page, plano(new Map([['103', [{ area: 0, habilidade: 1, conceito: 'NR', etapas: [1] }]]])));

  await aguardandoEm('101');
  await page.getByRole('button', { name: 'Salvar e próximo' }).click();
  await aguardandoEm('102');
  await page.getByRole('button', { name: 'Salvar e próximo' }).click();
  await aguardandoEm('103');
  await page.getByRole('button', { name: 'Salvar e sair' }).click();

  const final = await fim;
  expect(final.status).toBe('concluido');
  expect(await salvos(page)).toEqual({
    101: { '0.0.1': 'R', '0.1.1': 'R' },
    102: {},
    103: { '0.0.1': 'R', '0.1.1': 'NR' },
  });
  expect(final.preenchidos.map((p) => p.matricula)).toEqual(['101', '103']);
  await page.close();
});

it('skips a non-ATIVO estudante without writing', async () => {
  const page = await portal();
  const { fim, aguardandoEm } = executar(page, plano());

  await aguardandoEm('101');
  await page.getByRole('button', { name: 'Salvar e próximo' }).click();
  await aguardandoEm('102');
  await page.getByRole('button', { name: 'Salvar e sair' }).click();

  const final = await fim;
  expect((await salvos(page))[102]).toEqual({});
  expect(final.pulados).toEqual([{ matricula: '102', nome: 'BRUNO', motivo: 'Situação TRANSFERIDO.' }]);
  await page.close();
});

it('does not rewrite an estudante shown again', async () => {
  const page = await portal();
  const { fim, aguardandoEm } = executar(page, plano());

  await aguardandoEm('101');
  // The auxiliar lowers a conceito by hand, saves and comes back.
  await page.locator('[id$=":0:dtlistConceitoFichaVo:0:dtdatamodel:0:j_idt322:1:j_idt327:somRespostas_input"]').selectOption({ label: 'RD - REALIZA COM DIFICULDADES' });
  await page.getByRole('button', { name: 'Salvar e próximo' }).click();
  await aguardandoEm('102');
  await page.getByRole('button', { name: 'Salvar e anterior' }).click();
  await aguardandoEm('101');
  await page.getByRole('button', { name: 'Salvar e sair' }).click();

  await fim;
  expect((await salvos(page))[101]).toEqual({ '0.0.1': 'RD', '0.1.1': 'R' });
  await page.close();
});

it('ends as interrompido when the auxiliar closes the dialog', async () => {
  const page = await portal();
  const { fim, aguardandoEm } = executar(page, plano());

  await aguardandoEm('101');
  await page.getByRole('button', { name: 'Fechar' }).click();

  const final = await fim;
  expect(final.status).toBe('interrompido');
  expect(final.preenchidos).toHaveLength(1);
  await page.close();
});

it('ends as interrompido when the window is closed', async () => {
  const page = await portal();
  const { fim, aguardandoEm } = executar(page, plano());

  await aguardandoEm('101');
  await page.close();

  expect((await fim).status).toBe('interrompido');
});

it('never clicks a Salvar button', async () => {
  const page = await portal();
  const { fim, aguardandoEm } = executar(page, plano());

  await aguardandoEm('101');
  expect(await cliques(page)).toEqual([]);
  await page.getByRole('button', { name: 'Fechar' }).click();
  await fim;
  expect(await cliques(page)).toEqual(['Fechar']);
  await page.close();
});

it('stops without writing when the ficha changed since it was read', async () => {
  const page = await portal();
  const desatualizada = [{ indice: 0, titulo: 'OUTRA ÁREA', habilidades: [{ indice: 0, numero: '1°', texto: 'x' }] }];
  const { fim } = executar(page, { ...plano(), estrutura: desatualizada });

  const final = await fim;

  expect(final.status).toBe('falhou');
  expect(final.erro).toContain('Releia a ficha');
  expect(final.preenchidos).toEqual([]);
  expect(await page.locator('#dialogo select option:checked').evaluateAll((opcoes) => opcoes.filter((o) => (o as HTMLOptionElement).index > 0).length)).toBe(0);
  await page.close();
});

it('fills the four etapas of an estudante from the planned ficha', async () => {
  const page = await portal();
  const { fim, aguardandoEm } = executar(page, plano(
    new Map([['101', [{ area: 0, habilidade: 0, conceito: 'RD', etapas: [1, 2] }]]]),
    [1, 2, 3, 4],
  ));

  await aguardandoEm('101');
  await page.getByRole('button', { name: 'Salvar e sair' }).click();

  await fim;
  expect((await salvos(page))[101]).toEqual({
    '0.0.1': 'RD', '0.0.2': 'RD', '0.0.3': 'R', '0.0.4': 'R',
    '0.1.1': 'R', '0.1.2': 'R', '0.1.3': 'R', '0.1.4': 'R',
  });
  await page.close();
});

it('skips an ATIVO estudante who is not in the prévia', async () => {
  const page = await portal();
  const semCaio = plano();
  const fichas = new Map(semCaio.fichas);
  fichas.delete('103');
  const { fim, aguardandoEm } = executar(page, { ...semCaio, fichas });

  await aguardandoEm('101');
  await page.getByRole('button', { name: 'Salvar e próximo' }).click();
  await aguardandoEm('102');
  await page.getByRole('button', { name: 'Salvar e próximo' }).click();
  await aguardandoEm('103');
  await page.getByRole('button', { name: 'Salvar e sair' }).click();

  const final = await fim;
  expect((await salvos(page))[103]).toEqual({});
  expect(final.pulados).toContainEqual({ matricula: '103', nome: 'CAIO', motivo: 'Não está na prévia. Gere a prévia de novo para incluí-lo.' });
  await page.close();
});
