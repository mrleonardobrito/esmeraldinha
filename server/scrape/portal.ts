import { expect, type Locator, type Page } from '@playwright/test';
import {
  closeMenuPanel,
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
  EstudantesFilter,
  AulaDoPortal,
  ConteudoCatalogo,
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
  /** O menu de turma num período letivo da EJA. Veja `filtroDeTurma`. */
  turmaComMulti: ':turmaComMulti-SOM-CP-OBR',
  /** O portal chama a redução de _Grupo diário_. */
  reducao: ':grupoDiario-SOM-CP-OBR',
  mes: ':mes-SOM-CP-OBR',
  /**
   * Só no boletim, e só quando a etapa tem avaliação cadastrada. O portal a
   * chama de `disciplinaTurma` aqui, não de `disciplina`.
   */
  disciplina: ':disciplinaTurma-SOM-CP-OBR',
  /** Só na Ficha Desempenho, e só carrega depois da turma. */
  fichaDesempenho: ':fichaDesempenho-SOM-CP-OBR',
} as const;

/**
 * O menu do diálogo de _Configurações de ambiente_ em que o professor escolhe
 * o período letivo. É o mesmo diálogo do login e o da barra do topo.
 */
const AMBIENTE = {
  periodoLetivo: ':periodoLetivo-SOM-CP-OBR',
} as const;

const DIALOGO_DE_AMBIENTE = '#dialogConfiguracoesAmbiente';

/**
 * A turma da EJA é multisseriada, e o portal a serve por outro componente:
 * nas telas de um período letivo da EJA o menu de turma é o `turmaComMulti`,
 * não o `turma`. Para quem raspa é o mesmo menu, só o id muda — então quem
 * diz qual usar é a página, depois que a etapa foi escolhida e a tela
 * carregou.
 */
async function filtroDeTurma(page: Page): Promise<string> {
  const multi = page.locator(`[id$="${FILTER.turmaComMulti}"]`);

  return (await multi.count()) > 0 ? FILTER.turmaComMulti : FILTER.turma;
}

/**
 * Em qual período letivo cada página está, e quais o portal lhe oferece. O
 * portal não escreve o período em lugar nenhum fora do diálogo, então quem o
 * escolheu é quem lembra dele.
 */
const ambienteDaPagina = new WeakMap<Page, { atual: string; disponiveis: string[] }>();

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

  // O portal exige um período para entrar, mas qual deles não importa aqui:
  // cada leitura vai para o período da turma que lê. Sem nenhum, o professor
  // não tem turma em lugar algum e o portal não deixa passar do diálogo.
  const disponiveis = await readMenuOptions(page, AMBIENTE.periodoLetivo);
  const [primeiro] = disponiveis;

  if (!primeiro) {
    throw new LoginError('O portal não oferece nenhum período letivo para esta escola.');
  }

  await acessarPeriodoLetivo(page, primeiro);
  ambienteDaPagina.set(page, { atual: primeiro, disponiveis });
}

/** Escolhe o período no diálogo de ambiente já aberto e entra nele. */
async function acessarPeriodoLetivo(page: Page, periodoLetivo: string): Promise<void> {
  await page.locator(`[id$="${AMBIENTE.periodoLetivo}_label"]`).click();
  // Um professor da EJA vê "2026 EJA" ao lado de "2026"; sem `exact` os dois casam.
  await page.getByRole('option', { name: periodoLetivo, exact: true }).click();
  await waitForAjax(page);
  // No diálogo reaberto o painel fica aberto por cima do Acessar.
  await closeMenuPanel(page, AMBIENTE.periodoLetivo);

  await page.getByRole('button', { name: ' Acessar' }).click();
  await expect(page.locator(DIALOGO_DE_AMBIENTE)).toBeHidden({ timeout: AJAX_TIMEOUT_MS });
  await waitForAjax(page);
}

/**
 * Reabre o diálogo de _Configurações de ambiente_ pela barra do topo. O item
 * mora num submenu que só aparece com o mouse em cima, então o clique é
 * despachado direto no link, sem depender de o submenu estar à vista.
 */
async function abrirConfiguracoesDeAmbiente(page: Page): Promise<void> {
  await waitForAjax(page);

  await page
    .locator('.poseidon-menu a.ui-commandlink', { hasText: 'Configurações de ambiente' })
    .dispatchEvent('click');

  await expect(page.locator(`[id$="${AMBIENTE.periodoLetivo}_label"]`)).toBeVisible({
    timeout: AJAX_TIMEOUT_MS,
  });
  await waitForAjax(page);
}

/**
 * Os períodos letivos que o portal oferece ao professor, como o login os leu.
 * Uma página que não passou pelo `login` daqui os lê do diálogo e entra de
 * novo no período em que já estava — é o jeito de fechar o diálogo sem
 * mudar nada.
 */
export async function listPeriodosLetivos(page: Page): Promise<string[]> {
  const lembrado = ambienteDaPagina.get(page);
  if (lembrado) return [...lembrado.disponiveis];

  await abrirConfiguracoesDeAmbiente(page);
  const disponiveis = await readMenuOptions(page, AMBIENTE.periodoLetivo);
  const rotulo = (
    await page.locator(`[id$="${AMBIENTE.periodoLetivo}_label"]`).innerText()
  ).trim();
  const atual = disponiveis.includes(rotulo) ? rotulo : disponiveis[0];

  if (!atual) {
    throw new LoginError('O portal não oferece nenhum período letivo para esta escola.');
  }

  await acessarPeriodoLetivo(page, atual);
  ambienteDaPagina.set(page, { atual, disponiveis });

  return [...disponiveis];
}

/**
 * Deixa a sessão no período letivo pedido. Trocar de período é trocar de
 * ambiente no portal: a tela volta ao início e os filtros de etapa, turma e
 * mês passam a oferecer as turmas daquele período. Sem período, ou já nele,
 * não mexe em nada.
 */
export async function selecionarPeriodoLetivo(
  page: Page,
  periodoLetivo: string | undefined,
): Promise<void> {
  if (!periodoLetivo) return;

  const ambiente = ambienteDaPagina.get(page);
  if (ambiente?.atual === periodoLetivo) return;

  await abrirConfiguracoesDeAmbiente(page);
  const disponiveis = ambiente?.disponiveis ?? (await readMenuOptions(page, AMBIENTE.periodoLetivo));
  await acessarPeriodoLetivo(page, periodoLetivo);

  ambienteDaPagina.set(page, { atual: periodoLetivo, disponiveis });
}

export async function openLancaConteudo(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Etapa' }).click();
  await page.getByRole('link', { name: 'Lançamento de Conteúdo' }).click();
  await waitForAjax(page);
}

/**
 * As opções válidas do professor, para que o agente escolha entre elas em vez
 * de inventar uma turma. O período letivo manda primeiro: as turmas de cada
 * um só aparecem com a sessão nele. Dentro dele, a etapa manda: o portal
 * recarrega turmas e meses a cada troca, então cada etapa é selecionada uma
 * vez.
 */
export async function listConteudoOptions(page: Page): Promise<ConteudoCatalogo> {
  const etapas: EtapaOptions[] = [];

  for (const periodoLetivo of await listPeriodosLetivos(page)) {
    await selecionarPeriodoLetivo(page, periodoLetivo);
    await openLancaConteudo(page);

    const nomes = await readMenuOptions(page, FILTER.etapa);

    for (const nome of nomes) {
      await selectMenuOption(page, page, FILTER.etapa, nome);

      const turma = await filtroDeTurma(page);
      const turmas = await readMenuOptions(page, turma);

      // Os meses só carregam depois da turma e da redução. São os meses do
      // calendário da etapa, iguais para todas as turmas dela, então basta
      // escolher a primeira.
      if (turmas[0]) {
        await selectMenuOption(page, page, turma, turmas[0]);
        await selectFirstReducao(page);
      }

      etapas.push({
        nome,
        periodoLetivo,
        turmas,
        meses: turmas[0] ? await readMenuOptions(page, FILTER.mes) : [],
      });
    }
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
  { periodoLetivo, etapa, turma, mes }: ListaDeAulasFilter,
): Promise<AulaDoPortal[]> {
  await selecionarPeriodoLetivo(page, periodoLetivo);
  await openLancaConteudo(page);

  await selectMenuOption(page, page, FILTER.etapa, etapa);
  await selectMenuOption(page, page, await filtroDeTurma(page), turma);
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
  { periodoLetivo, turma }: EstudantesFilter,
): Promise<EstudanteDoPortal[]> {
  await selecionarPeriodoLetivo(page, periodoLetivo);
  await page.getByRole('link', { name: 'Etapa' }).click();
  await page.getByRole('link', { name: 'Ficha Desempenho' }).click();
  await waitForAjax(page);

  await selectMenuOption(page, page, await filtroDeTurma(page), turma);

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
 *
 * Depois das colunas de avaliação vêm cinco colunas fixas, nesta ordem: _Nota
 * origem_, _Nota calculada pelas avaliações_, _Nota parcial_, _Nota
 * personalizada_ e _Nota final da etapa_. Os nomes internos não seguem os
 * rótulos — `notaParcialTexto` é a _Nota origem_ e `notaAvaliacaoNotaParcial` é
 * a _Nota parcial_ —, então cada sufixo aqui está conferido contra o HTML real
 * pela posição da coluna; ver `.scratch/lancamento-de-notas/tela-do-portal.md`.
 *
 * A _Nota final da etapa_ não tem campo nenhum: o portal só a exibe.
 */
const NOTA = {
  /** A nota de uma avaliação, uma por coluna dentro da linha do estudante. */
  avaliacao: ':notaAvaliacao-CP_input',
  /** _Nota origem_: o que a etapa traz de fora das avaliações. Desabilitada. */
  origem: ':notaParcialTexto',
  /** _Nota calculada pelas avaliações_, pelo portal. Desabilitada. */
  calculada: ':notaAvaliacaoCalculada-CP_input',
  /** Editável: a _Nota parcial_. */
  parcial: ':notaAvaliacaoNotaParcial-CP_input',
  /** Editável: a _Nota personalizada_, que sobrepõe a calculada no boletim. */
  personalizada: ':notaAvaliacaoNota-CP_input',
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
  { periodoLetivo, etapa, turma, disciplina }: BoletimFilter,
): Promise<void> {
  await selecionarPeriodoLetivo(page, periodoLetivo);
  await openResultadoDeAvaliacao(page);

  await selectMenuOption(page, page, FILTER.etapa, etapa);
  await selectMenuOption(page, page, await filtroDeTurma(page), turma);

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
  { periodoLetivo, etapa, turma }: BoletimFilter,
): Promise<string[]> {
  await selecionarPeriodoLetivo(page, periodoLetivo);
  await openResultadoDeAvaliacao(page);

  await selectMenuOption(page, page, FILTER.etapa, etapa);
  await selectMenuOption(page, page, await filtroDeTurma(page), turma);

  // O seletor pode nem existir na tela quando não há avaliação nenhuma.
  const menu = page.locator(`[id$="${FILTER.disciplina}_input"]`);

  if ((await menu.count()) === 0) return [];

  return await readMenuOptions(page, FILTER.disciplina);
}

/**
 * O boletim de uma etapa numa disciplina: as avaliações que são as colunas, as
 * notas que o portal já tem nelas e as notas por estudante que não pertencem a
 * nenhuma avaliação — a parcial e a personalizada, mais as duas que o portal
 * calcula sozinho.
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

    const parcial = await lerCampo(row, NOTA.parcial);
    const personalizada = await lerCampo(row, NOTA.personalizada);
    // As desabilitadas são do portal: lidas para exibir, nunca escritas.
    const origem = await lerCampo(row, NOTA.origem);
    const calculada = await lerCampo(row, NOTA.calculada);

    notasDoEstudante.push({
      matricula,
      ...(parcial === undefined ? {} : { parcial }),
      ...(personalizada === undefined ? {} : { personalizada }),
      ...(origem === undefined ? {} : { origem }),
      ...(calculada === undefined ? {} : { calculada }),
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
 * Escreve a nota de cada avaliação e, quando informadas, a nota parcial e a
 * nota personalizada. A _Nota origem_ e a calculada chegam desabilitadas e não
 * são tocadas; a _Nota final da etapa_ o portal só exibe, e não tem campo para
 * receber nada.
 *
 * Levanta `MissingAulaRowsError` quando uma matrícula não casa com exatamente
 * uma linha, ou quando a avaliação não existe na etapa: lançar a nota no
 * estudante ou na coluna errada é pior do que não lançar nenhuma.
 */
export async function prepararNotasParaPreenchimento(
  page: Page,
  {
    periodoLetivo,
    etapa,
    turma,
    disciplina,
    notas,
    notasDoEstudante = [],
  }: PreenchimentoDeNotasFilter,
): Promise<void> {
  if (notas.length === 0 && notasDoEstudante.length === 0) {
    throw new Error('No notas provided.');
  }

  await irParaOBoletim(page, { periodoLetivo, etapa, turma, disciplina });

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

    if (nota.parcial !== undefined) {
      await escreverNota(page, linha.locator(`[id$="${NOTA.parcial}"]`), nota.parcial);
    }

    if (nota.personalizada !== undefined) {
      await escreverNota(page, linha.locator(`[id$="${NOTA.personalizada}"]`), nota.personalizada);
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
  { periodoLetivo, etapa, turma, mes, data, ordem, conteudo }: PreenchimentoAssistidoFilter,
): Promise<void> {
  await selecionarPeriodoLetivo(page, periodoLetivo);
  await openLancaConteudo(page);

  await selectMenuOption(page, page, FILTER.etapa, etapa);
  await selectMenuOption(page, page, await filtroDeTurma(page), turma);
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