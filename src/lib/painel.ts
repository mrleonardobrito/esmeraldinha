import {
  loadCadernetas,
  type Caderneta,
  type EtapaDaCaderneta,
  type StatusDaParte,
} from "@/lib/cadernetas";
import { loadProfessores, type Professor } from "@/lib/professores";

/**
 * Em que pé está uma caderneta, do ponto de vista de quem abre o painel: o que
 * ainda não teve uma linha preenchida, o que já foi mexido e não fechou, e o
 * que não pede mais nada. É a leitura do portal que decide — nenhuma dessas
 * três é marcada à mão.
 */
export type SituacaoDaCaderneta = "a-fazer" | "em-andamento" | "feita";

/**
 * As partes que a Esmeraldinha preenche hoje. Frequência e ficha de desempenho
 * ficam de fora da conta porque continuam sendo trabalho manual no portal:
 * contá-las deixaria toda caderneta eternamente incompleta.
 */
function partesContadas(etapa: EtapaDaCaderneta): StatusDaParte[] {
  return [etapa.conteudo, etapa.boletim];
}

export function situacaoDaCaderneta(caderneta: Caderneta): SituacaoDaCaderneta {
  const partes = caderneta.etapas.flatMap(partesContadas);

  // Sem etapas não há o que estar em andamento: a primeira leitura do portal
  // ainda não terminou, e até lá a caderneta é trabalho por fazer.
  if (partes.length === 0) return "a-fazer";
  if (partes.every((parte) => parte === "concluido")) return "feita";
  if (partes.every((parte) => parte === "pendente")) return "a-fazer";

  return "em-andamento";
}

/**
 * O quanto de uma caderneta já está no portal. Conteúdo e boletim pesam igual:
 * uma turma com centenas de notas e poucas aulas não vira uma caderneta quase
 * pronta só por ter lançado as notas.
 */
export function progressoDaCaderneta(caderneta: Caderneta): number {
  const somas = caderneta.etapas.reduce(
    (total, etapa) => ({
      aulasPreenchidas: total.aulasPreenchidas + etapa.aulasPreenchidas,
      totalDeAulas: total.totalDeAulas + etapa.totalDeAulas,
      notasLancadas: total.notasLancadas + etapa.notasLancadas,
      totalDeNotas: total.totalDeNotas + etapa.totalDeNotas,
    }),
    { aulasPreenchidas: 0, totalDeAulas: 0, notasLancadas: 0, totalDeNotas: 0 },
  );

  const fracoes = [
    fracao(somas.aulasPreenchidas, somas.totalDeAulas),
    fracao(somas.notasLancadas, somas.totalDeNotas),
  ].filter((valor): valor is number => valor !== null);

  if (fracoes.length === 0) return 0;

  return fracoes.reduce((soma, valor) => soma + valor, 0) / fracoes.length;
}

/** Nulo quando não há denominador: o portal ainda não disse quantas são. */
function fracao(feito: number, total: number): number | null {
  return total > 0 ? Math.min(1, feito / total) : null;
}

export interface ResumoDoPainel {
  total: number;
  aFazer: number;
  emAndamento: number;
  feitas: number;
  aulasPreenchidas: number;
  totalDeAulas: number;
  notasLancadas: number;
  totalDeNotas: number;
  /** De 0 a 1, a média do progresso de cada caderneta. */
  progresso: number;
}

export function resumoDoPainel(cadernetas: readonly Caderneta[]): ResumoDoPainel {
  const resumo: ResumoDoPainel = {
    total: cadernetas.length,
    aFazer: 0,
    emAndamento: 0,
    feitas: 0,
    aulasPreenchidas: 0,
    totalDeAulas: 0,
    notasLancadas: 0,
    totalDeNotas: 0,
    progresso: 0,
  };

  for (const caderneta of cadernetas) {
    const situacao = situacaoDaCaderneta(caderneta);
    if (situacao === "feita") resumo.feitas += 1;
    else if (situacao === "em-andamento") resumo.emAndamento += 1;
    else resumo.aFazer += 1;

    for (const etapa of caderneta.etapas) {
      resumo.aulasPreenchidas += etapa.aulasPreenchidas;
      resumo.totalDeAulas += etapa.totalDeAulas;
      resumo.notasLancadas += etapa.notasLancadas;
      resumo.totalDeNotas += etapa.totalDeNotas;
    }
  }

  if (cadernetas.length > 0) {
    const soma = cadernetas.reduce(
      (total, caderneta) => total + progressoDaCaderneta(caderneta),
      0,
    );
    resumo.progresso = soma / cadernetas.length;
  }

  return resumo;
}

/** Uma caderneta e o professor de quem ela é: o painel mistura todos eles. */
export interface ItemDoPainel {
  caderneta: Caderneta;
  professor: Professor;
}

export interface CadernetaParaRetomar extends ItemDoPainel {
  /** A primeira etapa que ainda não fechou — onde o trabalho parou. */
  etapa: string | null;
  progresso: number;
}

/**
 * O que estava sendo feito antes desta visita, do mais recente para o mais
 * antigo. A data usada é a da última leitura do portal: é o que a Esmeraldinha
 * sabe sobre quando aquela caderneta foi mexida pela última vez.
 */
export function cadernetasParaRetomar(
  itens: readonly ItemDoPainel[],
  limite = 3,
): CadernetaParaRetomar[] {
  return itens
    .filter((item) => situacaoDaCaderneta(item.caderneta) === "em-andamento")
    .sort((a, b) => instante(b.caderneta) - instante(a.caderneta))
    .slice(0, limite)
    .map((item) => ({
      ...item,
      etapa: etapaEmAberto(item.caderneta),
      progresso: progressoDaCaderneta(item.caderneta),
    }));
}

/** Uma caderneta nunca lida vai para o fim da fila, não para o começo. */
function instante(caderneta: Caderneta): number {
  const data = caderneta.syncedAt ?? caderneta.createdAt;
  const valor = Date.parse(data);

  return Number.isNaN(valor) ? 0 : valor;
}

function etapaEmAberto(caderneta: Caderneta): string | null {
  const etapa = caderneta.etapas.find((atual) =>
    partesContadas(atual).some((parte) => parte !== "concluido"),
  );

  return etapa?.nome ?? null;
}

/**
 * Quando aquela caderneta foi lida no portal pela última vez, em palavras.
 * É o que a Esmeraldinha sabe sobre quando alguém mexeu nela: o portal não
 * conta quem escreveu o quê, só o que está escrito agora.
 */
export function descreverQuando(iso: string | null, agora = new Date()): string {
  if (!iso) return "ainda não lida";

  const instante = Date.parse(iso);
  if (Number.isNaN(instante)) return "ainda não lida";

  const segundos = Math.round((instante - agora.getTime()) / 1000);
  const escalas: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.35],
    ["month", 12],
  ];

  let valor = segundos;
  for (const [unidade, tamanho] of escalas) {
    if (Math.abs(valor) < tamanho) return RELATIVO.format(Math.round(valor), unidade);
    valor /= tamanho;
  }

  return RELATIVO.format(Math.round(valor), "year");
}

const RELATIVO = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

export interface DadosDoPainel {
  professores: Professor[];
  itens: ItemDoPainel[];
}

/**
 * O painel é a soma de todos os professores, então ele lê a lista de cada um.
 * São poucos professores por instalação — uma escola, um auxiliar de ensino —
 * e por isso as leituras vão juntas, em vez de virarem uma rota nova na API.
 */
export async function carregarPainel(): Promise<DadosDoPainel> {
  const professores = await loadProfessores();

  const listas = await Promise.all(
    professores.map(async (professor) => {
      const cadernetas = await loadCadernetas(professor.id);
      return cadernetas.map((caderneta) => ({ caderneta, professor }));
    }),
  );

  return { professores, itens: listas.flat() };
}
