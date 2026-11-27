import { z } from 'zod';

/** The conceitos of the ficha de desempenho, from lowest to highest. */
export const CONCEITOS = ['NR', 'RD', 'R'] as const;
export type Conceito = (typeof CONCEITOS)[number];

/** The etapas as the ficha labels them, in order. */
export const ETAPAS_DA_FICHA = ['I ETAPA', 'II ETAPA', 'III ETAPA', 'IV ETAPA'] as const;
export type IndiceDaEtapa = 1 | 2 | 3 | 4;

/** The position (1–4) of an etapa in the ficha, from its name. */
export function indiceDaEtapa(nome: string): IndiceDaEtapa {
  const indice = ETAPAS_DA_FICHA.indexOf(nome.trim().toUpperCase() as (typeof ETAPAS_DA_FICHA)[number]);
  if (indice < 0) throw new Error(`The ficha de desempenho has no etapa named "${nome}".`);
  return (indice + 1) as IndiceDaEtapa;
}

/** One habilidade of an área, as the ficha numbers and describes it. */
export interface HabilidadeDaFicha {
  indice: number;
  /** As the portal writes it, e.g. `1°`. */
  numero: string;
  texto: string;
}

export interface AreaDeConhecimento {
  indice: number;
  titulo: string;
  habilidades: HabilidadeDaFicha[];
}

/** The áreas and habilidades of a turma's ficha, read from the portal. */
export interface EstruturaDaFicha {
  ficha: string;
  areas: AreaDeConhecimento[];
  lidaEm: string;
}

export const TODAS_AS_ETAPAS: readonly IndiceDaEtapa[] = [1, 2, 3, 4];

/** A conceito below R for one habilidade, in the etapas it applies to. */
export interface Excecao {
  area: number;
  habilidade: number;
  conceito: 'RD' | 'NR';
  etapas: IndiceDaEtapa[];
}

/** The conceito of each etapa (index = etapa − 1); null for etapas outside the run. */
export type LinhaDaFicha = (Conceito | null)[];

/** One estudante's planned ficha, keyed `${area}.${habilidade}`. */
export type FichaPlanejada = Record<string, LinhaDaFicha>;

export const chaveDaHabilidade = (area: number, habilidade: number) => `${area}.${habilidade}`;

export interface EstudanteDaPrevia {
  matricula: string;
  nome: string;
  situacao: string | null;
  /** What the observações said about this estudante. */
  trechos: string[];
  conceitos: FichaPlanejada;
}

export interface ObservacaoGeral {
  trecho: string;
  estudante: { matricula: string; nome: string } | null;
  excecoes: Excecao[];
}

export interface NomeNaoResolvido {
  estudante: string;
  motivo: string;
  candidatos: string[];
  excecoes: (Excecao & { trecho: string })[];
}

/** What will be written on the portal, estudante by estudante, before it is. */
export interface PreviaDaFicha {
  areas: number[];
  etapas: IndiceDaEtapa[];
  estudantes: EstudanteDaPrevia[];
  gerais: ObservacaoGeral[];
  naoResolvidos: NomeNaoResolvido[];
  descartadas: { motivo: string; trecho: string }[];
  /** The agent's short reply to the auxiliar de ensino. */
  resposta: string;
  atualizadaEm: string;
}

const posicao = (conceito: Conceito) => CONCEITOS.indexOf(conceito);
const menor = (a: Conceito, b: Conceito): Conceito => (posicao(a) <= posicao(b) ? a : b);
const maior = (a: Conceito, b: Conceito): Conceito => (posicao(a) >= posicao(b) ? a : b);
const ordenadas = (etapas: readonly IndiceDaEtapa[]) => [...new Set(etapas)].sort((a, b) => a - b);

/** Each chosen etapa raised to at least the previous chosen one: a conceito never decreases. */
export function normalizarLinha(linha: LinhaDaFicha, etapas: readonly IndiceDaEtapa[]): LinhaDaFicha {
  const nova = [...linha];
  let anterior: Conceito | null = null;
  for (const etapa of ordenadas(etapas)) {
    const atual = nova[etapa - 1];
    if (atual === null || atual === undefined) continue;
    nova[etapa - 1] = anterior === null ? atual : maior(atual, anterior);
    anterior = nova[etapa - 1];
  }
  return nova;
}

/**
 * Sets one etapa and keeps the row non-decreasing around it: earlier chosen
 * etapas above the new conceito come down to it, later ones below it go up.
 */
export function alterarConceito(
  linha: LinhaDaFicha,
  etapa: IndiceDaEtapa,
  conceito: Conceito,
  etapas: readonly IndiceDaEtapa[],
): LinhaDaFicha {
  const nova = [...linha];
  for (const outra of ordenadas(etapas)) {
    const atual = nova[outra - 1];
    if (outra === etapa) nova[outra - 1] = conceito;
    else if (atual === null || atual === undefined) continue;
    else if (outra < etapa) nova[outra - 1] = menor(atual, conceito);
    else nova[outra - 1] = maior(atual, conceito);
  }
  return nova;
}

/** Applies exceções, only ever lowering a conceito, then keeps each row non-decreasing. */
export function aplicarNaFicha(
  ficha: FichaPlanejada,
  excecoes: readonly Excecao[],
  etapas: readonly IndiceDaEtapa[],
): FichaPlanejada {
  const nova: FichaPlanejada = Object.fromEntries(Object.entries(ficha).map(([chave, linha]) => [chave, [...linha]]));
  for (const { area, habilidade, conceito, etapas: daExcecao } of excecoes) {
    const chave = chaveDaHabilidade(area, habilidade);
    let linha = nova[chave];
    if (!linha) continue;
    for (const etapa of ordenadas(daExcecao)) {
      const atual = linha[etapa - 1];
      if (!etapas.includes(etapa) || atual === null || atual === undefined) continue;
      linha = alterarConceito(linha, etapa, menor(atual, conceito), etapas);
    }
    nova[chave] = linha;
  }
  return nova;
}

/** R in every chosen etapa of every habilidade of the áreas, then the exceções. */
export function fichaInicial(
  areas: readonly AreaDeConhecimento[],
  etapas: readonly IndiceDaEtapa[],
  excecoes: readonly Excecao[],
): FichaPlanejada {
  const ficha: FichaPlanejada = {};
  for (const area of areas) {
    for (const habilidade of area.habilidades) {
      ficha[chaveDaHabilidade(area.indice, habilidade.indice)] =
        TODAS_AS_ETAPAS.map((etapa) => (etapas.includes(etapa) ? 'R' : null));
    }
  }
  return aplicarNaFicha(ficha, excecoes, etapas);
}

/**
 * The prévia following the áreas and etapas checked on screen, without
 * reading the observações again: an unchecked área or etapa leaves the
 * prévia, a checked área comes in with R, and a checked etapa copies the
 * nearest etapa before it (or after it, when it is the first) so no row
 * decreases.
 */
export function ajustarPrevia(
  previa: PreviaDaFicha,
  estrutura: readonly AreaDeConhecimento[],
  areas: readonly number[],
  etapas: readonly IndiceDaEtapa[],
): PreviaDaFicha {
  const chosen = ordenadas(etapas);
  const chaves = estrutura
    .filter((area) => areas.includes(area.indice))
    .flatMap((area) => area.habilidades.map((h) => chaveDaHabilidade(area.indice, h.indice)));

  const ajustarLinha = (linha: LinhaDaFicha | undefined): LinhaDaFicha => {
    const antiga = linha ?? TODAS_AS_ETAPAS.map(() => 'R' as Conceito);
    return TODAS_AS_ETAPAS.map((etapa) => {
      if (!chosen.includes(etapa)) return null;
      const propria = antiga[etapa - 1];
      if (propria) return propria;
      const antes = [...TODAS_AS_ETAPAS].reverse().find((outra) => outra < etapa && antiga[outra - 1]);
      const depois = TODAS_AS_ETAPAS.find((outra) => outra > etapa && antiga[outra - 1]);
      return (antes ? antiga[antes - 1] : depois ? antiga[depois - 1] : 'R') ?? 'R';
    });
  };

  return {
    ...previa,
    areas: estrutura.filter((area) => areas.includes(area.indice)).map((area) => area.indice),
    etapas: chosen,
    estudantes: previa.estudantes.map((estudante) => ({
      ...estudante,
      conceitos: Object.fromEntries(chaves.map((chave) => [chave, ajustarLinha(estudante.conceitos[chave])])),
    })),
  };
}

/** How many cells of a ficha are below R. */
export function contarExcecoes(ficha: FichaPlanejada): number {
  return Object.values(ficha).flat().filter((c) => c === 'RD' || c === 'NR').length;
}

const indice = z.number().int().nonnegative();
const etapaSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const conceitoSchema = z.enum(CONCEITOS);
const excecaoSchema = z.object({
  area: indice,
  habilidade: indice,
  conceito: z.enum(['RD', 'NR']),
  etapas: z.array(etapaSchema),
});

export const etapasSchema = z.array(etapaSchema).min(1);

/** What the screen sends back after the auxiliar edits the prévia. */
export const previaEditadaSchema = z.object({
  /** The `atualizadaEm` of the prévia these edits were made on. */
  versao: z.string().min(1),
  /** The áreas and etapas checked on screen: what gets filled. */
  areas: z.array(indice).min(1),
  etapas: etapasSchema,
  estudantes: z.array(z.object({
    matricula: z.string().trim().min(1),
    conceitos: z.record(z.string().regex(/^\d+\.\d+$/), z.array(conceitoSchema.nullable()).length(4)),
  })),
  gerais: z.array(z.object({
    trecho: z.string(),
    estudante: z.object({ matricula: z.string(), nome: z.string() }).nullable(),
    excecoes: z.array(excecaoSchema),
  })),
  naoResolvidos: z.array(z.object({
    estudante: z.string(),
    motivo: z.string(),
    candidatos: z.array(z.string()),
    excecoes: z.array(excecaoSchema.extend({ trecho: z.string() })),
  })),
});

export type PreviaEditada = z.infer<typeof previaEditadaSchema>;
