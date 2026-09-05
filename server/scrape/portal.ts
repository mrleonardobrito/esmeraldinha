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
  AvaliacaoDoPortal,
  BoletimDoPortal,
  BoletimFilter,
  NotaDoEstudante,
  NotaDoPortal,
  PreenchimentoDeNotasFilter,
  EstudanteDoPortal,
  AulaDoPortal,
  ConteudoCatalogo,
  DisciplinaOptions,
  EtapaOptions,
  ListaDeAulasFilter,
  PreenchimentoAssistidoFilter,
  ProfessorCredenciais,
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
  /** Só no boletim, e só quando a etapa tem avaliação cadastrada. */
  disciplina: ':disciplina-SOM-CP-OBR',
  /** Só na Ficha Desempenho, e só carrega depois da turma. */
  fichaDesempenho: ':fichaDesempenho-SOM-CP-OBR',
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
 * Acrescenta ao catálogo as disciplinas de cada etapa e as avaliações de cada
 * disciplina, lidas na tela de _Resultado de Avaliação_. É o que permite ao
 * agente escolher a coluna certa em vez de inventá-la.
 *
 * Feito à parte de `listConteudoOptions` porque custa uma volta por etapa e
 * por disciplina, e só o envio de notas precisa dele.
 */
export async function comAvaliacoes(
  page: Page,
  catalogo: ConteudoCatalogo,
): Promise<ConteudoCatalogo> {
  const etapas: EtapaOptions[] = [];

  for (const etapa of catalogo.etapas) {
    const turma = etapa.turmas[0];

    if (!turma) {
      etapas.push(etapa);
      continue;
    }

    const disciplinas: DisciplinaOptions[] = [];

    try {
      for (const nome of await listDisciplinas(page, { etapa: etapa.nome, turma })) {
        const { avaliacoes } = await listBoletim(page, {
          etapa: etapa.nome,
          turma,
          disciplina: nome,
        });

        disciplinas.push({ nome, avaliacoes });
      }
    } catch (error) {
      // Um catálogo sem avaliações ainda serve para lançar conteúdo; só o
      // envio de notas é que vai recusar, com a mensagem certa.
      console.error(`Falha ao ler as avaliações da ${etapa.nome}:`, error);
    }

    etapas.push({ ...etapa, disciplinas });
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
 * Os rótulos que o portal escreve dentro da célula de Estudantes. O nome do
 * estudante é o texto que vem antes do primeiro deles.
 */
const ROTULOS_DO_ESTUDANTE = ['Nome social:', 'Situação:', 'Data da matrícula:'] as const;

const NOME_SOCIAL_PATTERN = /Nome social:\s*([^]*?)(?=Situação:|Data da matrícula:|$)/i;
const SITUACAO_DA_MATRICULA_PATTERN = /Situação:\s*([A-Za-zÀ-ÿ]+)/i;
const DATA_DA_MATRICULA_PATTERN = /Data da matrícula:\s*(\d{2}\/\d{2}\/\d{4})/i;

/**
 * O que a célula de _Estudantes_ da Ficha Desempenho diz sobre um estudante.
 *
 * A célula é texto corrido: o nome vem solto no começo, seguido do botão
 * _Avaliar_ e de três rótulos em negrito. Nada disso está em span próprio com
 * classe, então a leitura é por rótulo, e não por seletor.
 *
 * Exportada para poder ser testada sem um navegador: é aqui que mora o que
 * pode quebrar quando o portal mexer no texto.
 */
export function lerCelulaDoEstudante(celula: string): {
  nome: string;
  situacao?: string;
  dataMatricula?: string;
} {
  const corte = ROTULOS_DO_ESTUDANTE.map((rotulo) => celula.indexOf(rotulo)).filter(
    (indice) => indice >= 0,
  );

  const fim = corte.length > 0 ? Math.min(...corte) : celula.length;

  const nomeDoCadastro = celula
    .slice(0, fim)
    // O botão Avaliar fica dentro da célula e entra no texto junto.
    .replace(/Avaliar/g, '')
    .trim();

  const nomeSocial = NOME_SOCIAL_PATTERN.exec(celula)?.[1]?.trim();
  const situacao = SITUACAO_DA_MATRICULA_PATTERN.exec(celula)?.[1]?.trim();
  const dataMatricula = DATA_DA_MATRICULA_PATTERN.exec(celula)?.[1];

  return {
    // O nome social é o nome pelo qual o estudante é chamado: quando o portal
    // o traz, é ele que vale.
    nome: nomeSocial || nomeDoCadastro,
    situacao: situacao || undefined,
    dataMatricula: dataMatricula ?? undefined,
  };
}

/**
 * O texto de uma célula sem o rótulo da coluna. O datatable do portal é
 * `reflow`: cada `<td>` repete o cabeçalho num `span.ui-column-title` para o
 * layout de celular, e esse rótulo viria grudado no valor.
 */
async function textoDaCelula(celula: Locator): Promise<string> {
  const texto = await celula.evaluate((el: Element) => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.ui-column-title').forEach((titulo) => {
      titulo.remove();
    });
    return clone.textContent ?? '';
  });

  return texto.replace(/[\s\u00a0]+/g, ' ').trim();
}

/**
 * Os estudantes matriculados na turma, lidos da tela de _Ficha Desempenho_ —
 * é ela que lista a turma inteira com matrícula, situação e data da matrícula.
 *
 * A ficha é obrigatória na tela e a tabela só aparece depois que ela está
 * escolhida, então a primeira opção é selecionada: qual ficha se olha não muda
 * quem está matriculado.
 *
 * Devolve lista vazia quando a turma não tem ficha ou não tem linhas — uma
 * turma sem estudantes é um estado possível, não um erro de leitura.
 */
export async function listEstudantes(
  page: Page,
  { turma }: { turma: string },
): Promise<EstudanteDoPortal[]> {
  await page.getByRole('link', { name: 'Etapa' }).click();
  await page.getByRole('link', { name: 'Ficha Desempenho' }).click();
  await waitForAjax(page);

  await selectMenuOption(page, page, FILTER.turma, turma);

  // A ficha só é oferecida depois da turma; sem nenhuma, não há tabela.
  const [primeiraFicha] = await readMenuOptions(page, FILTER.fichaDesempenho);
  if (!primeiraFicha) return [];

  await selectMenuOption(page, page, FILTER.fichaDesempenho, primeiraFicha);

  const rows = page.locator('tr[data-ri]');
  if ((await rows.count()) === 0) return [];

  const estudantes: EstudanteDoPortal[] = [];

  for (const row of await rows.all()) {
    const celulas = row.locator('td');

    // Ordem, matrícula, estudantes e os três diagnósticos.
    if ((await celulas.count()) < 3) continue;

    const matricula = (await textoDaCelula(celulas.nth(1))).trim();

    // Sem matrícula não há como chavear o boletim, então a linha não serve.
    if (!/^\d+$/.test(matricula)) continue;

    const { nome, situacao, dataMatricula } = lerCelulaDoEstudante(
      await textoDaCelula(celulas.nth(2)),
    );

    if (!nome) continue;

    estudantes.push({ matricula, nome, situacao, dataMatricula });
  }

  return estudantes;
}

/**
 * Os campos da tela de _Resultado de Avaliação_, como o portal os nomeia.
 * Conferidos contra o HTML real; ver `.scratch/lancamento-de-notas/tela-do-portal.md`.
 */
const NOTA = {
  /** A nota de uma avaliação, uma por coluna dentro da linha do estudante. */
  avaliacao: ':notaAvaliacao-CP_input',
  /** Calculada pelo portal a partir das avaliações. Sempre desabilitada. */
  calculada: ':notaAvaliacaoCalculada-CP_input',
  /** Também calculada pelo portal, e desabilitada. */
  parcialCalculada: ':notaParcialTexto',
  /** Editável: o que o portal chama de _Nota personalizada_. */
  personalizada: ':notaAvaliacaoNotaParcial-CP_input',
  /** Editável: a _Nota final da etapa_. */
  final: ':notaAvaliacaoNota-CP_input',
} as const;

/** As linhas do boletim não têm `data-ri`: são os `tr` do corpo da tabela. */
const LINHA_DO_BOLETIM = 'tbody[id$="tbody_element"] > tr';

const VALOR_PATTERN = /Valor:?\s*([\d.,]+)/i;
const MEDIA_PATTERN = /Média:?\s*([\d.,]+)/i;

/** O número como o portal o escreve: vírgula decimal. */
function parseNota(texto: string): number | undefined {
  const limpo = texto.trim().replace(',', '.');

  if (limpo === '') return undefined;

  const valor = Number(limpo);

  return Number.isFinite(valor) ? valor : undefined;
}

export async function openResultadoDeAvaliacao(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Etapa' }).click();
  await page.getByRole('link', { name: 'Resultado de Avaliação' }).click();
  await waitForAjax(page);
}

/**
 * Deixa a tela de _Resultado de Avaliação_ na etapa, turma e disciplina
 * pedidas. É o caminho comum de ler e escrever notas, como `openLancaConteudo`
 * é para as aulas.
 *
 * A disciplina só tem opções quando a etapa tem avaliação cadastrada; quando
 * não tem, seleciona-se o que der e a tabela simplesmente não aparece — é
 * assim que `listBoletim` descobre que não há o que lançar.
 */
async function irParaOBoletim(
  page: Page,
  { etapa, turma, disciplina }: BoletimFilter,
): Promise<void> {
  await openResultadoDeAvaliacao(page);

  await selectMenuOption(page, page, FILTER.etapa, etapa);
  await selectMenuOption(page, page, FILTER.turma, turma);

  if (disciplina) {
    await selectMenuOption(page, page, FILTER.disciplina, disciplina);
  }
}

/**
 * O texto que segue um rótulo em negrito no cabeçalho da coluna. O portal
 * escreve `<b>Nome:</b><br><span>OBSERVAÇÃO</span>`, então o rótulo e o valor
 * são irmãos, não pai e filho.
 */
function depoisDoRotulo(texto: string, rotulo: string): string | undefined {
  const marca = new RegExp(`${rotulo}:?\\s*`, 'i');
  const match = marca.exec(texto);

  if (!match) return undefined;

  const resto = texto.slice(match.index + match[0].length).trim();

  return resto === '' ? undefined : resto;
}

/**
 * As avaliações do cabeçalho, na ordem em que o portal as mostra — que é a
 * ordem dos campos de nota dentro de cada linha.
 *
 * Uma coluna é de avaliação quando traz o rótulo `Nome:`; as colunas fixas
 * (Ordem, Matrícula, Estudantes, Nota parcial, …) não trazem, e é assim que
 * elas se distinguem sem depender de casar os nomes delas.
 */
async function lerAvaliacoesDoCabecalho(page: Page): Promise<AvaliacaoDoPortal[]> {
  const avaliacoes: AvaliacaoDoPortal[] = [];

  for (const th of await page.locator('th').all()) {
    // Cada rótulo é um span em negrito seguido do valor; lidos em sequência,
    // o texto inteiro da célula já basta para separá-los.
    const bruto = (await th.innerText()).replace(/[\s\u00a0]+/g, ' ').trim();

    const nome = depoisDoRotulo(bruto, 'Nome')
      ?.replace(/\s*Tipo:.*$/i, '')
      .trim();

    // Sem `Nome:` não é coluna de avaliação.
    if (!nome) continue;

    const tipo = depoisDoRotulo(bruto, 'Tipo')
      ?.replace(/\s*Data da avaliação:.*$/i, '')
      .trim();

    const valor = VALOR_PATTERN.exec(bruto)?.[1];
    const media = MEDIA_PATTERN.exec(bruto)?.[1];

    avaliacoes.push({
      nome,
      ...(tipo === undefined || tipo === '' ? {} : { tipo }),
      ...(valor === undefined ? {} : { valor: parseNota(valor) ?? 0 }),
      ...(media === undefined ? {} : { media: parseNota(media) ?? 0 }),
    });
  }

  return avaliacoes;
}

/** A matrícula que a linha mostra: a segunda coluna, um número puro. */
async function matriculaDaLinha(row: Locator): Promise<string | undefined> {
  const celulas = await row.locator('td').all();

  for (const celula of celulas.slice(0, 3)) {
    const texto = (await celula.innerText()).replace(/[\s\u00a0]+/g, ' ').trim();

    // A primeira coluna é a ordem (1, 2, 3…) e a segunda a matrícula. As duas
    // são números, então vale a mais longa: a ordem tem um ou dois dígitos.
    if (/^\d{3,}$/.test(texto)) return texto;
  }

  return undefined;
}

/**
 * O valor de um campo da linha, ou `undefined` quando ele não existe ali ou
 * está vazio — um campo em branco não é nota lançada.
 */
async function lerCampo(row: Locator, sufixo: string): Promise<number | undefined> {
  const campo = row.locator(`[id$="${sufixo}"]`);

  if ((await campo.count()) !== 1) return undefined;

  return parseNota(await campo.inputValue());
}

/**
 * As disciplinas que a turma tem na etapa. O portal só as oferece quando há
 * avaliação cadastrada: uma lista vazia quer dizer "nada a lançar nesta
 * etapa", e é o que faz a tela pedir o cadastro da avaliação.
 */
export async function listDisciplinas(
  page: Page,
  { etapa, turma }: BoletimFilter,
): Promise<string[]> {
  await openResultadoDeAvaliacao(page);

  await selectMenuOption(page, page, FILTER.etapa, etapa);
  await selectMenuOption(page, page, FILTER.turma, turma);

  // O seletor pode nem existir na tela quando não há avaliação nenhuma.
  const menu = page.locator(`[id$="${FILTER.disciplina}_input"]`);

  if ((await menu.count()) === 0) return [];

  return await readMenuOptions(page, FILTER.disciplina);
}

/**
 * O boletim de uma etapa numa disciplina: as avaliações que são as colunas, as
 * notas que o portal já tem nelas e as notas por estudante que não pertencem a
 * nenhuma avaliação — a personalizada e a final da etapa.
 *
 * A tabela só existe quando a etapa tem avaliação cadastrada. Sem ela, o
 * portal não mostra nem a tabela nem a disciplina, e o boletim volta vazio:
 * é a resposta legítima de "não há o que lançar aqui ainda", não uma falha.
 */
export async function listBoletim(
  page: Page,
  filtro: BoletimFilter,
): Promise<BoletimDoPortal> {
  await irParaOBoletim(page, filtro);

  const rows = page.locator(LINHA_DO_BOLETIM);
  if ((await rows.count()) === 0) {
    return { avaliacoes: [], notas: [], notasDoEstudante: [] };
  }

  const avaliacoes = await lerAvaliacoesDoCabecalho(page);
  const notas: NotaDoPortal[] = [];
  const notasDoEstudante: NotaDoEstudante[] = [];

  for (const row of await rows.all()) {
    const matricula = await matriculaDaLinha(row);

    // Sem matrícula não há como chavear a nota, então a linha não serve.
    if (!matricula) continue;

    // Os campos de nota saem na ordem das colunas: o n-ésimo campo é a
    // n-ésima avaliação.
    const campos = await row.locator(`[id$="${NOTA.avaliacao}"]`).all();

    for (const [indice, campo] of campos.entries()) {
      const avaliacao = avaliacoes[indice];
      if (!avaliacao) continue;

      const valor = parseNota(await campo.inputValue());
      if (valor === undefined) continue;

      notas.push({ matricula, avaliacao: avaliacao.nome, valor });
    }

    const personalizada = await lerCampo(row, NOTA.personalizada);
    const final = await lerCampo(row, NOTA.final);
    // As calculadas são do portal: lidas para exibir, nunca escritas.
    const calculada = await lerCampo(row, NOTA.calculada);
    const parcial = await lerCampo(row, NOTA.parcialCalculada);

    notasDoEstudante.push({
      matricula,
      ...(personalizada === undefined ? {} : { personalizada }),
      ...(final === undefined ? {} : { final }),
      ...(calculada === undefined ? {} : { calculada }),
      ...(parcial === undefined ? {} : { parcial }),
    });
  }

  return { avaliacoes, notas, notasDoEstudante };
}

/** A linha do estudante no boletim, achada pela matrícula que o portal escreve. */
export function findEstudanteRow(page: Page, matricula: string): Locator {
  return page
    .locator(LINHA_DO_BOLETIM)
    .filter({ has: page.locator('td', { hasText: new RegExp(`^\\s*${matricula}\\s*$`) }) });
}

/**
 * Deixa a tela do portal pronta no boletim da etapa, com as notas editadas já
 * escritas nos campos — e para aí. Não salva, pelo mesmo motivo que
 * `prepararAulaParaPreenchimento` não salva: conferir e gravar é do auxiliar
 * de ensino.
 *
 * Escreve a nota de cada avaliação e, quando informadas, a nota personalizada
 * e a nota final da etapa. As calculadas o portal preenche sozinho — elas
 * chegam desabilitadas e não são tocadas.
 *
 * Levanta `MissingAulaRowsError` quando uma matrícula não casa com exatamente
 * uma linha, ou quando a avaliação não existe na etapa: lançar a nota no
 * estudante ou na coluna errada é pior do que não lançar nenhuma.
 */
export async function prepararNotasParaPreenchimento(
  page: Page,
  { etapa, turma, disciplina, notas, notasDoEstudante = [] }: PreenchimentoDeNotasFilter,
): Promise<void> {
  if (notas.length === 0 && notasDoEstudante.length === 0) {
    throw new Error('No notas provided.');
  }

  await irParaOBoletim(page, { etapa, turma, disciplina });

  await expect(
    page.locator(LINHA_DO_BOLETIM).first(),
    'the boletim table did not load',
  ).toBeVisible({ timeout: AJAX_TIMEOUT_MS });

  const avaliacoes = (await lerAvaliacoesDoCabecalho(page)).map(
    (avaliacao) => avaliacao.nome,
  );

  // Confere tudo antes de escrever qualquer coisa: um boletim meio preenchido
  // é pior de desfazer do que um que nem começou.
  const ausentes: string[] = [];
  const matriculas = new Set([
    ...notas.map((nota) => nota.matricula),
    ...notasDoEstudante.map((nota) => nota.matricula),
  ]);

  for (const matricula of matriculas) {
    const linhas = await findEstudanteRow(page, matricula).count();

    if (linhas !== 1) {
      ausentes.push(
        linhas === 0
          ? `${matricula} (nenhuma linha)`
          : `${matricula} (${linhas} linhas)`,
      );
    }
  }

  for (const avaliacao of new Set(notas.map((nota) => nota.avaliacao))) {
    if (!avaliacoes.includes(avaliacao)) {
      ausentes.push(`${avaliacao} (avaliação não existe nesta etapa)`);
    }
  }

  if (ausentes.length > 0) {
    throw new MissingAulaRowsError(ausentes);
  }

  for (const nota of notas) {
    const linha = findEstudanteRow(page, nota.matricula);
    const indice = avaliacoes.indexOf(nota.avaliacao);
    const campo = linha.locator(`[id$="${NOTA.avaliacao}"]`).nth(indice);

    await escreverNota(page, campo, nota.valor);
  }

  for (const nota of notasDoEstudante) {
    const linha = findEstudanteRow(page, nota.matricula);

    if (nota.personalizada !== undefined) {
      await escreverNota(page, linha.locator(`[id$="${NOTA.personalizada}"]`), nota.personalizada);
    }

    if (nota.final !== undefined) {
      await escreverNota(page, linha.locator(`[id$="${NOTA.final}"]`), nota.final);
    }
  }

  const primeira = notas[0]?.matricula ?? notasDoEstudante[0]?.matricula;

  if (primeira) {
    await findEstudanteRow(page, primeira)
      .scrollIntoViewIfNeeded()
      .catch(() => {});
  }
}

/**
 * Escreve uma nota num campo do PrimeFaces. O portal usa vírgula decimal e
 * dispara AJAX ao sair do campo, então cada nota espera a sua volta.
 */
async function escreverNota(page: Page, campo: Locator, valor: number): Promise<void> {
  await campo.fill(String(valor).replace('.', ','));
  await campo.blur();
  await waitForAjax(page);
}

/**
 * Deixa a tela do portal pronta na linha de uma aula, com o conteúdo editado
 * já escrito nos campos — e para aí. Não salva: quem confere e decide gravar
 * é o auxiliar de ensino, na janela que ficou aberta.
 *
 * Levanta `MissingAulaRowsError` quando a data não casa com exatamente uma
 * linha: preencher a linha errada é pior do que não preencher nenhuma.
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