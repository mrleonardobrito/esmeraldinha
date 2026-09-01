/**
 * Dry run do envio: loga no portal com o navegador visível, lê o plano de aula
 * com o agente e preenche a tela de Lançamento de Conteúdo — sem clicar em
 * Salvar. Tira um print a cada passo.
 *
 * As credenciais vêm de logins.json na raiz (fora do git), no formato
 * [{ nome, user, password, escola }].
 *
 * Uso: tsx --env-file=.env scripts/dry-run-envio.ts <imagem> [nome-ou-indice]
 */
import { mkdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { chromium, type Page } from 'playwright';

import {
  login,
  openLancaConteudo,
  listConteudoOptions,
  findAulaRow,
  selectFirstReducao,
} from '../server/scrape/portal';
import { fillField, selectMenuOption } from '../server/scrape/primefaces';
import { interpretarEnvio } from '../server/ai/interpretar-envio';
import { env } from '../server/env';

const SHOTS = process.env.SHOTS_DIR ?? '.portal-debug/dry-run';

let passo = 0;
async function print(page: Page, nome: string): Promise<void> {
  passo += 1;
  const file = join(SHOTS, `${String(passo).padStart(2, '0')}-${nome}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[print] ${file}`);
}

interface LoginEntry {
  nome: string;
  user: string;
  password: string;
  escola: string;
}

/** logins.json é escrito à mão, então as chaves podem vir sem aspas. */
async function readLogins(): Promise<LoginEntry[]> {
  const raw = await readFile('logins.json', 'utf8');
  const quoted = raw
    .replace(/([{,]\s*)([A-Za-z_][\w]*)(\s*:)/g, '$1"$2"$3')
    .replace(/,(\s*[}\]])/g, '$1');

  return JSON.parse(quoted) as LoginEntry[];
}

const FILTER = {
  etapa: ':etapaPeriodo-SOM-CP-OBR',
  turma: ':turma-SOM-CP-OBR',
  mes: ':mes-SOM-CP-OBR',
} as const;

const FIELD = {
  isRecuperacao: ':recuperacaoParalela-SOM-CP',
  isInteracao: ':iteracao-SOM-CP',
  codigoCR: ':codigoCurrilo',
  desenvolvimento: ':desenvolvimento',
  ferramentas: ':ferramentasUtilizadas',
} as const;

function mimeTypeOf(path: string): string {
  const ext = path.toLowerCase().split('.').pop();
  if (ext === 'png') return 'image/png';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'txt' || ext === 'md') return 'text/plain';
  return 'image/jpeg';
}

async function main(): Promise<void> {
  const imagePath = process.argv[2];
  if (!imagePath) throw new Error('Passe o caminho da imagem do plano de aula.');

  const professores = await readLogins();
  const alvo = process.argv[3];
  const escolhido =
    professores.find((professor) => professor.nome === alvo) ??
    professores[alvo ? Number(alvo) : 0];

  if (!escolhido) throw new Error(`Professor "${alvo}" não está em logins.json.`);

  const credenciais = {
    login: escolhido.user,
    senha: escolhido.password,
    escola: escolhido.escola,
  };
  console.log(`[0] Professor: ${escolhido.nome} — ${escolhido.escola}`);

  await mkdir(SHOTS, { recursive: true });

  const browser = await chromium.launch({ headless: false, slowMo: 250 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    console.log('[1] Login no portal…');
    await login(page, credenciais, env.portalUrl);
    await page.waitForTimeout(2000);
    await print(page, 'portal-aberto');

    console.log('[2] Lendo o catálogo de etapas, turmas e meses…');
    const catalogo = await listConteudoOptions(page);
    console.log(JSON.stringify(catalogo, null, 2));
    await print(page, 'catalogo-lancamento-de-conteudo');

    console.log('[3] Mandando a imagem para o agente…');
    const plano = await interpretarEnvio({
      catalogo,
      arquivos: [
        {
          filename: basename(imagePath),
          mimeType: mimeTypeOf(imagePath),
          data: new Uint8Array(await readFile(imagePath)),
        },
      ],
    });
    console.log(JSON.stringify(plano, null, 2));

    console.log('[4] Aplicando os filtros detectados…');
    await openLancaConteudo(page);
    await selectMenuOption(page, page, FILTER.etapa, plano.etapa);
    await selectMenuOption(page, page, FILTER.turma, plano.turma);
    console.log(`  redução: ${(await selectFirstReducao(page)) ?? '(nenhuma)'}`);
    await selectMenuOption(page, page, FILTER.mes, plano.mes);
    await page.waitForTimeout(1500);
    await print(page, 'filtros-aplicados');

    console.log('[5] Preenchendo as aulas (sem salvar)…');
    for (const aula of plano.aulas) {
      const row = findAulaRow(page, aula.data, aula.ordem);
      const encontradas = await row.count();
      console.log(`  ${aula.data} (ordem: ${aula.ordem ?? 'qualquer'}): ${encontradas} linha(s)`);
      if (encontradas !== 1) continue;

      await row.scrollIntoViewIfNeeded();
      await selectMenuOption(page, row, FIELD.isRecuperacao, aula.isRecuperacao);
      await selectMenuOption(page, row, FIELD.isInteracao, aula.isInteracao);
      await fillField(page, row, FIELD.codigoCR, aula.codigoCR);
      await fillField(page, row, FIELD.desenvolvimento, aula.desenvolvimento);
      await fillField(page, row, FIELD.ferramentas, aula.ferramentas);

      await print(page, `aula-${aula.data.replace(/\//g, '-')}-preenchida`);
    }

    console.log('[6] Pronto. Nada foi salvo — nenhum clique em Salvar.');
    await page.waitForTimeout(3000);
    await print(page, 'estado-final');
  } catch (error) {
    console.error('[erro]', error);
    await print(page, 'erro').catch(() => {});
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
}

await main();
