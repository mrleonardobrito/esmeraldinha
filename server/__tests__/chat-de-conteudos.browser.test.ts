import { build } from 'esbuild';
import { resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';

let browser: Browser;
let html: string;
const dates = ['05/08/2026', '12/08/2026', '19/08/2026'];

beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import React, { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { ChatDeConteudos } from '@/components/chat-de-conteudos';
        const initial = ${JSON.stringify(dates)}.map(data => ({
          etapa:'III ETAPA',mes:'Agosto',data,ordem:5,conteudoPreenchido:false,
          codigoCR:null,desenvolvimento:null,ferramentas:null,
        }));
        function App() {
          const [aulas, setAulas] = useState(initial);
          return <ChatDeConteudos
            caderneta={{id:'batch',professorId:'prof',turma:'1º ANO D',etapas:[]}}
            etapa="III ETAPA" aulas={aulas} mesInicial="Agosto" sessionId="portal"
            onVoltar={() => {}}
            onGravou={() => fetch('/persisted').then(r=>r.json()).then(setAulas)}
          />;
        }
        createRoot(document.getElementById('root')).render(<App/>);
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

it('prepares every selected aula automatically, then keeps unverified rascunhos until a successful retry', async () => {
  const page = await browser.newPage();
  const drafts = dates.map((data) => ({ data, ordem: 5, codigoCR: 'CR', desenvolvimento: `Conteúdo ${data}`, ferramentas: 'Livro' }));
  let preparations = 0;
  let verifications = 0;
  let savedCount = 0;
  await page.route('http://batch.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (path.endsWith('/rascunhos')) {
      return route.fulfill({ json: { resposta: 'Rascunhos prontos.', aulas: drafts } });
    }
    if (path.endsWith('/preenchimentos-assistidos')) {
      preparations++;
      const input = route.request().postDataJSON();
      expect(input.aulas.map((aula: { data: string }) => aula.data)).toEqual(dates);
      return route.fulfill({ json: { preparadas: 3, meses: ['Agosto'] } });
    }
    if (path.endsWith('/verificacoes')) {
      verifications++;
      savedCount = verifications === 1 ? 1 : 3;
      const input = route.request().postDataJSON();
      return route.fulfill({ json: { aulas: input.aulas.map((aula: { data: string }) => ({
        ...aula, preenchida: dates.indexOf(aula.data) < savedCount,
      })) } });
    }
    if (path === '/persisted') {
      return route.fulfill({ json: drafts.map((draft, index) => ({
        ...draft, etapa: 'III ETAPA', mes: 'Agosto', conteudoPreenchido: index < savedCount,
      })) });
    }
    return route.fulfill({ status: 404, body: path });
  });
  try {
    await page.goto('http://batch.test/');
    await page.getByRole('textbox', { name: 'Mensagem para o agente' }).fill('Prepare agosto');
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await page.getByRole('button', { name: 'Preencher no portal', exact: true }).click();
    await page.getByText('3 aulas para conferir', { exact: true }).waitFor();
    expect(preparations).toBe(1);
    expect(verifications).toBe(0);
    expect(await page.getByRole('button', { name: 'Próxima', exact: true }).count()).toBe(0);

    await page.getByRole('button', { name: 'Concluí, verificar' }).click();
    await page.getByText(/Ainda não foi confirmado o salvamento de: 12\/08, 19\/08/).waitFor();
    expect(await page.locator('[data-aula="12/08/2026#5"]').textContent()).toContain('Conteúdo 12/08/2026');
    expect(await page.locator('[data-aula="19/08/2026#5"]').textContent()).toContain('Conteúdo 19/08/2026');
    await page.getByRole('button', { name: 'Concluí, verificar' }).click();
    await page.getByText('3/3 preenchidas', { exact: true }).waitFor();
    expect(await page.getByRole('button', { name: 'Preencher no portal', exact: true }).count()).toBe(0);
    expect(preparations).toBe(1);
    expect(verifications).toBe(2);
  } finally { await page.close(); }
}, 15_000);
