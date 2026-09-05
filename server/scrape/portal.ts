import { expect, type Locator, type Page } from '@playwright/test';
import {
  fillField,
  readMenuOptions,
  selectMenuOption,
  waitForAjax,
  AJAX_TIMEOUT_MS,
} from './primefaces';
import { LoginError, MissingAulaRowsError } from './errors';
import type {
  EstudanteDoPortal,
  AulaDoPortal,
  ConteudoCatalogo,
  EtapaOptions,
  LancaConteudoFilter,
  ListaDeAulasFilter,
  PreenchimentoAssistidoFilter,
  AulaFailure,
  ProfessorCredenciais,
  WriteResult,
} from './types';

export const PORTAL_URL =
  'https://educacao.cloud.el.com.br/al-limoeirodeanadia-pm-edu/paginas/portalProfessor/index.xhtml';

const FIELD = {
  isRecuperacao: ':recuperacaoParalela-SOM-CP',
  isInteracao: ':iteracao-SOM-CP',
  codigoCR: ':codigoCurrilo',
  desenvolvimento: ':desenvolvimento',
  ferramentas: ':ferramentasUtilizadas',
} as const;

const FILTER = {
  etapa: ':etapaPeriodo-SOM-CP-OBR',
  turma: ':turma-SOM-CP-OBR',
  /** O portal chama a redução de _Grupo diário_. */
  reducao: ':grupoDiario-SOM-CP-OBR',
  mes: ':mes-SOM-CP-OBR',
} as const;

export async function login(
  page: Page,
  credentials: ProfessorCredenciais,
  portalUrl: string = PORTAL_URL,
): Promise<void> {
  await page.goto(portalUrl);

  await page.getByRole('textbox', { name: 'Usuário' }).fill(credentials.login);
  await page.getByRole('textbox', { name: 'Senha' }).fill(credentials.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();

  const escolaCell = page.getByRole('cell', { name: 'Escola' });

  try {
    await expect(escolaCell).toBeVisible({ timeout: AJAX_TIMEOUT_MS });
  } catch {
    throw new LoginError(
      'Login não foi bem-sucedido. Verifique suas credenciais e tente novamente.',
    );
  }

  await escolaCell.getByRole('button').click();
  await page.getByRole('option', { name: credentials.escola, exact: true }).click();
  await waitForAjax(page);

  await page.locator('[id*="periodoLetivo-SOM-CP-OBR_label"]').click();
  await page.getByRole('option', { name: '2026' }).click();

  await waitForAjax(page);

  await page.getByRole('button', { name: ' Acessar' }).click();
}

export async function openLancaConteudo(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Etapa' }).click();
  await page.getByRole('link', { name: 'Lançamento de Conteúdo' }).click();
  await waitForAjax(page);
}

/**
 * As opções válidas do professor, para que o agente escolha entre elas em vez
 * de inventar uma turma. A etapa manda: o portal recarrega turmas e meses a
 * cada troca, então cada etapa é selecionada uma vez.
 */
export async function listConteudoOptions(page: Page): Promise<ConteudoCatalogo> {
  await openLancaConteudo(page);

  const nomes = await readMenuOptions(page, FILTER.etapa);
  const etapas: EtapaOptions[] = [];

  for (const nome of nomes) {
    await selectMenuOption(page, page, FILTER.etapa, nome);

    const turmas = await readMenuOptions(page, FILTER.turma);

    // Os meses só carregam depois da turma e da redução. São os meses do
    // calendário da etapa, iguais para todas as turmas dela, então basta
    // escolher a primeira.
    if (turmas[0]) {
      await selectMenuOption(page, page, FILTER.turma, turmas[0]);
      await selectFirstReducao(page);
    }

    etapas.push({
      nome,
      turmas,
      meses: turmas[0] ? await readMenuOptions(page, FILTER.mes) : [],
    });
  }

  return { etapas };
}

/**
 * A ordem da aula é do portal, não do plano do professor: quem a define é o
 * grupo diário da turma. Só filtramos por ela quando o material a informa —
 * do contrário, a data sozinha já identifica a linha.
 */
/**
 * A redução não vem do material do professor: é o grupo diário sob o qual a
 * turma arquiva suas aulas. Ficamos com a primeira opção, que é a que o portal
 * usa para a turma.
 */
export async function selectFirstReducao(page: Page): Promise<string | undefined> {
  const [primeira] = await readMenuOptions(page, FILTER.reducao);

  if (!primeira) return undefined;

  await selectMenuOption(page, page, FILTER.reducao, primeira);

  return primeira;
}

const MATRICULA_PATTERN = /Matr[íi]cula:?\s*(\S+)/i;
const SITUACAO_PATTERN = /^(ATIVO|INATIVO|TRANSFERIDO|CANCELADO|CONCLU[ÍI]DO)$/i;
const DATA_PATTERN = /\d{2}\/\d{2}\/\d{4}/;
const ORDEM_PATTERN = /Ordem da Aula:\s*(\d+)/;

export function findAulaRow(page: Page, date: string, ordem?: number): Locator {
  const byDate = page
    .locator('tr[data-ri]')
    .filter({ has: page.locator('span.texto1', { hasText: date }) });

  if (ordem === undefined) return byDate;

  return byDate.filter({
    has: page.locator('span.texto1', { hasText: `Ordem da Aula: ${ordem}` }),
  });
}

/**
 * O que o portal escreveu num campo da linha, ou `undefined` quando o campo
 * não existe ali ou está em branco — um campo vazio não é conteúdo lançado.
 */
async function readFieldValue(row: Locator, field: string): Promise<string | undefined> {
  const campo = row.locator(`[id$="${field}"]`);

  if ((await campo.count()) !== 1) return undefined;

  const valor = (await campo.inputValue()).trim();

  return valor === '' ? undefined : valor;
}

/**
 * As aulas que o portal já tem para uma etapa/turma/mês, na ordem em que ele
 * as mostra. É o espelho de `postAulaContent`: mesmos filtros, mesmas linhas,
 * só que lendo. Uma aula conta como preenchida quando o desenvolvimento dela
 * não está vazio — o portal é a única fonte de verdade sobre isso.
 */
export async function listAulas(
  page: Page,
  { etapa, turma, mes }: ListaDeAulasFilter,
): Promise<AulaDoPortal[]> {
  await openLancaConteudo(page);

  await selectMenuOption(page, page, FILTER.etapa, etapa);
  await selectMenuOption(page, page, FILTER.turma, turma);
  await selectFirstReducao(page);
  await selectMenuOption(page, page, FILTER.mes, mes);

  const rows = page.locator('tr[data-ri]');

  // Um mês sem aulas é um resultado legítimo, não uma falha: a tabela
  // simplesmente não aparece. Só esperamos pela primeira linha se houver uma.
  if ((await rows.count()) === 0) return [];

  const aulas: AulaDoPortal[] = [];

  for (const row of await rows.all()) {
    const textos = await row.locator('span.texto1').allTextContents();
    const data = textos
      .map((texto) => DATA_PATTERN.exec(texto)?.[0])
      .find((match): match is string => match !== undefined);

    if (!data) continue;

    const ordem = textos
      .map((texto) => ORDEM_PATTERN.exec(texto)?.[1])
      .find((match): match is string => match !== undefined);

    const codigoCR = await readFieldValue(row, FIELD.codigoCR);
    const desenvolvimento = await readFieldValue(row, FIELD.desenvolvimento);
    const ferramentas = await readFieldValue(row, FIELD.ferramentas);

    aulas.push({
      data,
      ...(ordem === undefined ? {} : { ordem: Number(ordem) }),
      ...(codigoCR === undefined ? {} : { codigoCR }),
      ...(desenvolvimento === undefined ? {} : { desenvolvimento }),
      ...(ferramentas === undefined ? {} : { ferramentas }),
      preenchida: desenvolvimento !== undefined,
    });
  }

  return aulas;
}

/**
 * Os estudantes matriculados na turma, lidos da tela de Lançamento de
 * Presença — é ela que lista a turma inteira, uma linha por matrícula.
 *
 * Os seletores desta função ainda não foram conferidos contra o portal de
 * verdade: faltam credenciais para isso. Ela devolve lista vazia quando não
 * reconhece a tela, em vez de estourar, para que uma raspagem parcial não
 * derrube o resto — o que ela sabe sobre aulas continua valendo.
 */
export async function listEstudantes(
  page: Page,
  { etapa, turma }: { etapa: string; turma: string },
): Promise<EstudanteDoPortal[]> {
  await page.getByRole('link', { name: 'Etapa' }).click();
  await page.getByRole('link', { name: 'Lançamento de Presença' }).click();
  await waitForAjax(page);

  await selectMenuOption(page, page, FILTER.etapa, etapa);
  await selectMenuOption(page, page, FILTER.turma, turma);
  await selectFirstReducao(page);

  const rows = page.locator('tr[data-ri]');
  if ((await rows.count()) === 0) return [];

  const estudantes: EstudanteDoPortal[] = [];

  for (const row of await rows.all()) {
    const textos = (await row.locator('span.texto1').allTextContents()).map((texto) =>
      texto.replace(/[\s\u00a0]+/g, ' ').trim(),
    );

    const matricula = textos
      .map((texto) => MATRICULA_PATTERN.exec(texto)?.[1])
      .find((match): match is string => match !== undefined);

    // Sem matrícula não há como chavear o boletim, então a linha não serve.
    if (!matricula) continue;

    const nome = textos.find(
      (texto) => texto.length > 0 && !MATRICULA_PATTERN.test(texto) && !/^\d+$/.test(texto),
    );

    if (!nome) continue;

    const situacao = textos.find((texto) => SITUACAO_PATTERN.test(texto));

    estudantes.push({ matricula, nome, situacao: situacao ?? undefined });
  }

  return estudantes;
}

/**
 * Deixa a tela do portal pronta na linha de uma aula, com o conteúdo editado
 * já escrito nos campos — e para aí. Não salva: quem confere e decide gravar
 * é o auxiliar de ensino, na janela que ficou aberta. É por isso que ela não
 * devolve `WriteResult` como `postAulaContent`: não há gravação para relatar.
 *
 * Levanta `MissingAulaRowsError` quando a data não casa com exatamente uma
 * linha, pelo mesmo motivo que `postAulaContent`: preencher a linha errada é
 * pior do que não preencher nenhuma.
 */
export async function prepararAulaParaPreenchimento(
  page: Page,
  { etapa, turma, mes, data, ordem, conteudo }: PreenchimentoAssistidoFilter,
): Promise<void> {
  await openLancaConteudo(page);

  await selectMenuOption(page, page, FILTER.etapa, etapa);
  await selectMenuOption(page, page, FILTER.turma, turma);
  await selectFirstReducao(page);
  await selectMenuOption(page, page, FILTER.mes, mes);

  await expect(
    page.locator('tr[data-ri]').first(),
    'the diary table did not load',
  ).toBeVisible({ timeout: AJAX_TIMEOUT_MS });

  const row = findAulaRow(page, data, ordem);
  const count = await row.count();

  if (count !== 1) {
    throw new MissingAulaRowsError([
      count === 0
        ? `${data} (nenhuma linha)`
        : `${data} (${count} linhas — informe a ordem da aula)`,
    ]);
  }

  await selectMenuOption(page, row, FIELD.isRecuperacao, conteudo.isRecuperacao);
  await selectMenuOption(page, row, FIELD.isInteracao, conteudo.isInteracao);

  await fillField(page, row, FIELD.codigoCR, conteudo.codigoCR);
  await fillField(page, row, FIELD.desenvolvimento, conteudo.desenvolvimento);
  await fillField(page, row, FIELD.ferramentas, conteudo.ferramentas);

  // A linha é o assunto da janela: deixá-la à vista poupa o auxiliar de
  // procurá-la numa tabela de um mês inteiro.
  await row.scrollIntoViewIfNeeded().catch(() => {});
}

export async function postAulaContent(
  page: Page,
  { etapa, turma, mes, aulas }: LancaConteudoFilter,
): Promise<WriteResult> {
  if (aulas.length === 0) {
    throw new Error('No aulas provided.');
  }

  await openLancaConteudo(page);

  await selectMenuOption(page, page, FILTER.etapa, etapa);
  await selectMenuOption(page, page, FILTER.turma, turma);
  await selectFirstReducao(page);
  await selectMenuOption(page, page, FILTER.mes, mes);

  await expect(
    page.locator('tr[data-ri]').first(),
    'the diary table did not load',
  ).toBeVisible({ timeout: AJAX_TIMEOUT_MS });

  const unmatched: string[] = [];
  for (const aula of aulas) {
    const count = await findAulaRow(page, aula.data, aula.ordem).count();
    if (count !== 1) {
      unmatched.push(
        count === 0
          ? `${aula.data} (nenhuma linha)`
          : `${aula.data} (${count} linhas — informe a ordem da aula)`,
      );
    }
  }
  if (unmatched.length > 0) {
    throw new MissingAulaRowsError(unmatched);
  }

  const succeeded: string[] = [];
  const failed: AulaFailure[] = [];

  for (const aula of aulas) {
    const label = aula.ordem === undefined ? aula.data : `${aula.data} #${aula.ordem}`;
    try {
      const row = findAulaRow(page, aula.data, aula.ordem);

      await selectMenuOption(page, row, FIELD.isRecuperacao, aula.isRecuperacao);
      await selectMenuOption(page, row, FIELD.isInteracao, aula.isInteracao);

      await fillField(page, row, FIELD.codigoCR, aula.codigoCR);
      await fillField(page, row, FIELD.desenvolvimento, aula.desenvolvimento);

      await fillField(page, row, FIELD.ferramentas, aula.ferramentas);

      succeeded.push(label);
    } catch (error: unknown) {
      failed.push({
        aula: label,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // TODO: Adicionar botão "Salvar" e clicar nele, se necessário. Atualmente, o portal salva automaticamente.
  
  return { succeeded, failed };
}