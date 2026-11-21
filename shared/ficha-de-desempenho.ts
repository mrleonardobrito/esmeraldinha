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

/** A conceito below R for one habilidade: everything else is R. */
export interface Excecao {
  area: number;
  habilidade: number;
  conceito: 'RD' | 'NR';
}

const indice = z.number().int().nonnegative();

export const preenchimentoDaFichaSchema = z.object({
  areas: z.array(indice).min(1),
  excecoes: z.array(z.object({
    matricula: z.string().trim().min(1),
    area: indice,
    habilidade: indice,
    conceito: z.enum(['RD', 'NR']),
  })),
});

export type PreenchimentoDaFicha = z.infer<typeof preenchimentoDaFichaSchema>;
