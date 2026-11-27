import { build } from 'esbuild';
import { resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';

let browser: Browser;
let html: string;
let cadastroHtml: string;
const turmas = ['1º ANO A - MATUTINO', '1º ANO B - VESPERTINO'];

beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { LancarNotas } from '@/components/lancar-notas';
        const caderneta = {
          id:'grouped',professorId:'prof',turma:${JSON.stringify(turmas[0])},
          turmas:${JSON.stringify(turmas)},etapas:[],syncedAt:'2026-08-01',
        };
        createRoot(document.getElementById('root')).render(
          <LancarNotas caderneta={caderneta} etapa="III ETAPA" sessionId="portal"
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
  const cadastro = await build({
    stdin: {
      contents: `
        import React, { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { CadastrarCaderneta } from '@/components/cadastrar-caderneta';
        function App() {
          const [open, setOpen] = useState(true);
          const [cadernetas, setCadernetas] = useState([]);
          return <>
            {open && <CadastrarCaderneta sessionId="portal" professorId="prof"
              jaCadastradas={[]} onClose={() => setOpen(false)}
              onCadastrou={setCadernetas} />}
            <output aria-label="Saved cadernetas">{JSON.stringify(cadernetas)}</output>
          </>;
        }
        createRoot(document.getElementById('root')).render(<App />);
      `,
      loader: 'tsx', resolveDir: process.cwd(),
    },
    bundle: true, write: false, format: 'iife',
    alias: { '@': resolve('src'), '@shared': resolve('shared') },
    define: { 'process.env.NODE_ENV': '"production"' },
    jsx: 'automatic',
  });
  cadastroHtml = `<div id="root"></div><script>${cadastro.outputFiles[0].text}</script>`;
  browser = await chromium.launch();
}, 20_000);

afterAll(async () => { await browser?.close(); });

it('clears unsaved notas when changing turma and prepares only the selected turma', async () => {
  const page = await browser.newPage();
  const reads: string[] = [];
  const writes: { turma: string | null; notas: { matricula: string; valor: number }[] }[] = [];
  await page.route('http://grouped.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    const turma = url.searchParams.get('turma');
    if (url.pathname === '/api/cadernetas/grouped') {
      return route.fulfill({ json: {
        id: 'grouped', professorId: 'prof', turma, turmas, etapas: [], syncedAt: '2026-08-01',
      } });
    }
    if (url.pathname.endsWith('/boletim')) {
      reads.push(turma!);
      return route.fulfill({ json: {
        etapa: 'III ETAPA', disciplina: 'LÍNGUA PORTUGUESA',
        disciplinas: ['LÍNGUA PORTUGUESA'], disciplinasLancadas: [],
        estudantes: [{ matricula: '123', nome: 'Maria', situacao: 'ATIVO' }],
        avaliacoes: [{ nome: 'OBSERVAÇÃO', valor: 10, media: null }],
        notas: [{ matricula: '123', avaliacao: 'OBSERVAÇÃO', valor: turma === turmas[0] ? 2 : 8 }],
        notasDoEstudante: [],
        classificacaoPadrao: 'Acima da média', classificacoes: {},
      } });
    }
    if (url.pathname.endsWith('/preenchimentos-assistidos')) {
      writes.push({ turma, notas: request.postDataJSON().notas });
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ status: 404, body: url.pathname });
  });

  try {
    await page.goto('http://grouped.test/');
    const nota = page.getByRole('textbox', { name: 'Nota de Maria em OBSERVAÇÃO', exact: true });
    await nota.waitFor();
    expect(await nota.inputValue()).toBe('2');
    await nota.fill('5');

    await page.getByRole('combobox', { name: 'Turma', exact: true }).selectOption(turmas[1]);
    await nota.waitFor();
    expect(await nota.inputValue()).toBe('8');
    await page.getByRole('button', { name: 'Preencher no sistema', exact: true }).click();
    await page.getByText(/O portal está aberto no boletim/).waitFor();
    expect(writes).toEqual([{
      turma: turmas[1], notas: [{ matricula: '123', avaliacao: 'OBSERVAÇÃO', valor: 8 }],
    }]);

    await page.getByRole('combobox', { name: 'Turma', exact: true }).selectOption(turmas[0]);
    await nota.waitFor();
    expect(await nota.inputValue()).toBe('2');
    expect(reads).toEqual([turmas[0], turmas[1], turmas[0]]);
  } finally { await page.close(); }
}, 15_000);

it('registers four turmas de redução and one turma with professor regente without a manual grouping choice', async () => {
  const page = await browser.newPage();
  const reducao = ['1º ANO A', '1º ANO B', '2º ANO A', '4º ANO C'];
  const regente = '3º ANO A';
  const selected = [...reducao, regente];
  const expected = [
    { id: 'existing-reducao', professorId: 'prof', turma: reducao[0], turmas: reducao },
    { id: 'regente', professorId: 'prof', turma: regente, turmas: [regente] },
  ];
  let posted: Record<string, unknown> | undefined;
  await page.route('http://cadastro.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: cadastroHtml });
    if (url.pathname === '/api/cadernetas/turmas') {
      return route.fulfill({ json: {
        turmas: selected,
        gruposDiariosPorTurma: selected.map((turma) => ({
          turma, grupoDiario: turma === regente ? 'REGENTE'
            : turma === '4º ANO C' ? 'REDUÇÃO VITORIA' : 'REDUÇÃO TARDE',
        })),
      } });
    }
    if (url.pathname === '/api/cadernetas' && request.method() === 'POST') {
      posted = request.postDataJSON();
      return route.fulfill({ json: { cadernetas: expected, recusadas: [] } });
    }
    return route.fulfill({ status: 404, body: url.pathname });
  });
  try {
    await page.goto('http://cadastro.test/');
    await page.getByRole('checkbox', { name: 'Todas as turmas', exact: true }).check();
    expect(await page.getByRole('checkbox').count()).toBe(6);
    expect(await page.getByText(/Turmas de redução are combined automatically/).count()).toBe(1);
    await page.getByRole('button', { name: 'Create cadernetas', exact: true }).click();
    await page.getByRole('status', { name: 'Saved cadernetas' }).waitFor();
    await page.getByRole('heading', { name: 'Nova caderneta' }).waitFor({ state: 'hidden' });
    expect(posted).toEqual({ sessionId: 'portal', professorId: 'prof', turmas: selected });
    expect(JSON.parse(await page.getByRole('status', { name: 'Saved cadernetas' }).textContent() ?? 'null')).toEqual(expected);
  } finally { await page.close(); }
}, 15_000);
