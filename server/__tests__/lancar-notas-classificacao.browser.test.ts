import { build } from 'esbuild';
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';

let browser: Browser;
let html: string;
const turma = '3º ANO - 3º ANO B - INTEGRAL';
const avaliacoes = ['OBSERVAÇÃO', 'TRABALHO INDIVIDUAL', 'TRABALHO EM GRUPO', 'AVALIAÇÃO/PROVA'];

beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { LancarNotas } from '@/components/lancar-notas';
        const caderneta = {
          id:'cad',professorId:'prof',turma:${JSON.stringify(turma)},
          turmas:[${JSON.stringify(turma)}],etapas:[],syncedAt:'2026-08-01',
        };
        createRoot(document.getElementById('root')).render(
          <LancarNotas caderneta={caderneta} etapa="I ETAPA" sessionId="portal"
            onClose={() => {}} onGravou={() => {}} />
        );
      `,
      loader: 'tsx', resolveDir: process.cwd(),
    },
    bundle: true, write: false, format: 'iife',
    alias: { '@': resolve('src'), '@shared': resolve('shared') },
    define: { 'process.env.NODE_ENV': '"production"' },
    jsx: 'automatic',
  });
  html = `<div id="root"></div><script>${result.outputFiles[0].text}</script>`;
  browser = await chromium.launch();
}, 20_000);

afterAll(async () => { await browser?.close(); });

/**
 * ANA has portal notas (2 each) and a nota personalizada; BRUNO has none and a
 * stored Abaixo da média; CARLA and DAVI have nothing and follow the padrão.
 */
async function abrir() {
  const page = await browser.newPage();
  const padroes: string[] = [];
  const preenchimentos: { classificacoes?: unknown; notas: unknown[] }[] = [];

  await page.route('http://notas.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname.endsWith('/boletim')) {
      return route.fulfill({ json: {
        etapa: 'I ETAPA', disciplina: 'MATEMÁTICA',
        disciplinas: ['MATEMÁTICA'], disciplinasLancadas: ['MATEMÁTICA'],
        estudantes: ['ANA', 'BRUNO', 'CARLA', 'DAVI'].map((nome, indice) => ({
          matricula: String(indice + 1), nome, situacao: 'ATIVO', dataMatricula: null,
        })),
        avaliacoes: avaliacoes.map((nome) => ({ nome, tipo: null, data: null, valor: 2.5, media: 1.5 })),
        notas: avaliacoes.map((avaliacao) => ({ matricula: '1', avaliacao, valor: 2 })),
        notasDoEstudante: [
          { matricula: '1', origem: null, calculada: 8, parcial: null, personalizada: 9 },
        ],
        classificacaoPadrao: 'Acima da média',
        classificacoes: { '2': 'Abaixo da média' },
      } });
    }
    if (url.pathname.endsWith('/classificacao-padrao')) {
      padroes.push(request.postDataJSON().classificacao);
      return route.fulfill({ json: { classificacao: request.postDataJSON().classificacao } });
    }
    if (url.pathname.endsWith('/preenchimentos-assistidos')) {
      preenchimentos.push(request.postDataJSON());
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ status: 404, body: url.pathname });
  });

  await page.goto('http://notas.test/');
  await page.getByRole('textbox', { name: 'Nota final de ANA', exact: true }).waitFor();

  return { page, padroes, preenchimentos };
}

async function linha(page: Page, nome: string) {
  const notas = await Promise.all(
    avaliacoes.map((avaliacao) =>
      page.getByRole('textbox', { name: `Nota de ${nome} em ${avaliacao}`, exact: true }).inputValue(),
    ),
  );
  const final = await page.getByRole('textbox', { name: `Nota final de ${nome}`, exact: true }).inputValue();
  const classificacao = await page
    .getByRole('combobox', { name: `Classificação de ${nome}`, exact: true })
    .textContent();
  return { notas, final, classificacao: classificacao?.trim() };
}

async function escolher(page: Page, combobox: string, opcao: string) {
  await page.getByRole('combobox', { name: combobox, exact: true }).click();
  await page.getByRole('option', { name: opcao, exact: true }).click();
}

it('opens each row from the portal, its own classificação or the padrão', async () => {
  const { page } = await abrir();
  try {
    expect(await linha(page, 'ANA')).toEqual({
      notas: ['2', '2', '2', '2'], final: '8', classificacao: 'Acima da média',
    });
    expect(await linha(page, 'BRUNO')).toEqual({
      notas: ['1,5', '1,5', '1', '1'], final: '5', classificacao: 'Abaixo da média',
    });
    expect(await linha(page, 'CARLA')).toEqual({
      notas: ['2,5', '2,5', '2,5', '2,5'], final: '10', classificacao: 'Acima da média',
    });
    await page.getByText(/A nota personalizada do portal sobrepõe/).waitFor();
    expect(await page.getByText(/A nota personalizada do portal sobrepõe/).count()).toBe(1);
  } finally { await page.close(); }
}, 15_000);

it('keeps classificação, nota final and avaliações in step', async () => {
  const { page } = await abrir();
  try {
    await escolher(page, 'Classificação de CARLA', 'Na média');
    expect(await linha(page, 'CARLA')).toEqual({
      notas: ['2', '2', '1,5', '1,5'], final: '7', classificacao: 'Na média',
    });

    const final = page.getByRole('textbox', { name: 'Nota final de CARLA', exact: true });
    await final.fill('8');
    await final.press('Enter');
    expect(await linha(page, 'CARLA')).toEqual({
      notas: ['2', '2', '2', '2'], final: '8', classificacao: 'Acima da média',
    });

    const prova = page.getByRole('textbox', { name: 'Nota de DAVI em AVALIAÇÃO/PROVA', exact: true });
    await prova.fill('1');
    expect(await linha(page, 'DAVI')).toEqual({
      notas: ['2,5', '2,5', '2,5', '1'], final: '8,5', classificacao: 'Acima da média',
    });
    await prova.fill('0');
    expect((await linha(page, 'DAVI')).classificacao).toBe('Na média');
  } finally { await page.close(); }
}, 15_000);

it('saves the padrão and moves only the rows that still follow it', async () => {
  const { page, padroes } = await abrir();
  try {
    const prova = page.getByRole('textbox', { name: 'Nota de DAVI em AVALIAÇÃO/PROVA', exact: true });
    await prova.fill('1');

    await escolher(page, 'Classificação padrão da turma', 'Na média');

    expect(padroes).toEqual(['Na média']);
    expect((await linha(page, 'CARLA')).notas).toEqual(['2', '2', '1,5', '1,5']);
    expect((await linha(page, 'DAVI')).notas).toEqual(['2,5', '2,5', '2,5', '1']);
    expect((await linha(page, 'BRUNO')).notas).toEqual(['1,5', '1,5', '1', '1']);
    expect((await linha(page, 'ANA')).notas).toEqual(['2', '2', '2', '2']);
  } finally { await page.close(); }
}, 15_000);

it('fills every row and sends the classificações along', async () => {
  const { page, preenchimentos } = await abrir();
  try {
    await page.getByRole('button', { name: 'Preencher no sistema', exact: true }).click();
    await page.getByText(/O portal está aberto no boletim/).waitFor();

    expect(preenchimentos).toHaveLength(1);
    expect(preenchimentos[0].notas).toHaveLength(16);
    expect(preenchimentos[0].classificacoes).toEqual([
      { matricula: '1', classificacao: 'Acima da média' },
      { matricula: '2', classificacao: 'Abaixo da média' },
      { matricula: '3', classificacao: 'Acima da média' },
      { matricula: '4', classificacao: 'Acima da média' },
    ]);
  } finally { await page.close(); }
}, 15_000);
