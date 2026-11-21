/**
 * The rules that turn a classificação into notas and notas back into a
 * classificação. Shared by the Lançar Notas grid and the chat de notas, so a
 * nota typed by hand and one written by the agent behave the same way.
 *
 * Everything is computed in half-units (value × 2): notas move in steps of
 * 0,5, and integers do not drift the way 0.1 + 0.2 does.
 */

export const CLASSIFICACOES = ['Acima da média', 'Na média', 'Abaixo da média'] as const;

export type Classificacao = (typeof CLASSIFICACOES)[number];

/** What a turma's classificação padrão is until the auxiliar changes it. */
export const CLASSIFICACAO_PADRAO_INICIAL: Classificacao = 'Acima da média';

/** The scale the portal's avaliações add up to. */
const ESCALA = 10;

/** Lower bound of each band, as a fraction of the etapa total. */
const PISO: Record<Classificacao, number> = {
  'Acima da média': 0.8,
  'Na média': 0.6,
  'Abaixo da média': 0,
};

/** The nota final choosing a classificação generates, as a fraction of the total. */
const GERADA: Record<Classificacao, number> = {
  'Acima da média': 1,
  'Na média': 0.7,
  'Abaixo da média': 0.5,
};

export interface AvaliacaoComValor {
  readonly nome: string;
  readonly valor: number | null;
}

export function isClassificacao(valor: unknown): valor is Classificacao {
  return typeof valor === 'string' && (CLASSIFICACOES as readonly string[]).includes(valor);
}

/**
 * Each avaliação's valor, filling in the ones the portal does not inform:
 * they split equally what the known valores leave of 10.
 */
export function valoresEfetivos(avaliacoes: readonly AvaliacaoComValor[]): number[] {
  const conhecidos = avaliacoes.reduce((soma, { valor }) => soma + (valor ?? 0), 0);
  const semValor = avaliacoes.filter(({ valor }) => valor === null).length;
  const parte = semValor === 0 ? 0 : Math.max(ESCALA - conhecidos, 0) / semValor;

  return avaliacoes.map(({ valor }) => valor ?? parte);
}

export function totalDaEtapa(avaliacoes: readonly AvaliacaoComValor[]): number {
  return valoresEfetivos(avaliacoes).reduce((soma, valor) => soma + valor, 0);
}

/** The nearest multiple of 0,5, kept inside `[0, maximo]`. */
export function arredondarNota(valor: number, maximo: number): number {
  const arredondado = Math.round(valor * 2) / 2;
  return Math.min(Math.max(arredondado, 0), maximo);
}

export function classificar(notaFinal: number, total: number): Classificacao {
  if (notaFinal >= PISO['Acima da média'] * total) return 'Acima da média';
  if (notaFinal >= PISO['Na média'] * total) return 'Na média';
  return 'Abaixo da média';
}

/** Leveling up: the top the classificação generates, rounded down to 0,5. */
export function notaFinalDaClassificacao(classificacao: Classificacao, total: number): number {
  return Math.floor(GERADA[classificacao] * total * 2) / 2;
}

/**
 * Splits a nota final across the avaliações, in proportion to each valor and
 * rounded down to 0,5; the leftover goes 0,5 at a time to the first
 * avaliações, in portal order, that still have room.
 */
export function distribuir(notaFinal: number, avaliacoes: readonly AvaliacaoComValor[]): number[] {
  const limites = valoresEfetivos(avaliacoes).map((valor) => Math.floor(valor * 2));
  const total = limites.reduce((soma, limite) => soma + limite, 0);

  if (total === 0) return limites.map(() => 0);

  const alvo = Math.round(arredondarNota(notaFinal, total / 2) * 2);
  const partes = limites.map((limite) => Math.min(limite, Math.floor((alvo * limite) / total)));
  let sobra = alvo - partes.reduce((soma, parte) => soma + parte, 0);

  while (sobra > 0) {
    let distribuiu = false;
    for (let indice = 0; indice < partes.length && sobra > 0; indice += 1) {
      if (partes[indice] < limites[indice]) {
        partes[indice] += 1;
        sobra -= 1;
        distribuiu = true;
      }
    }
    if (!distribuiu) break;
  }

  return partes.map((parte) => parte / 2);
}
