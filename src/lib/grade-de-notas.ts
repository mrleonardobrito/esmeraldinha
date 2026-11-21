import {
  classificar,
  distribuir,
  notaFinalDaClassificacao,
  totalDaEtapa,
  type AvaliacaoComValor,
  type Classificacao,
} from "@shared/classificacao-de-notas";

import type { BoletimDaEtapa } from "@/lib/cadernetas";

/**
 * Every editable cell of the Lançar Notas grid, by key, as the text the
 * auxiliar sees. Avaliação columns are `matrícula|avaliação`; the two
 * estudante columns are `matrícula|#parcial` and `matrícula|#personalizada` —
 * the `#` keeps them apart from an avaliação that happened to share the name.
 */
export type NotasEditadas = Record<string, string>;

/** The two notas on the estudante's row the portal lets you edit. */
export type CampoDoEstudante = "parcial" | "personalizada";

export function chaveDaNota(matricula: string, avaliacao: string): string {
  return `${matricula}|${avaliacao}`;
}

export function chaveDoEstudante(matricula: string, campo: CampoDoEstudante): string {
  return `${matricula}|#${campo}`;
}

/** The number as the auxiliar types it: comma or dot. */
export function paraNumero(bruto: string | undefined): number | undefined {
  if (bruto === undefined || bruto.trim() === "") return undefined;

  const valor = Number(bruto.replace(",", "."));

  return Number.isFinite(valor) ? valor : undefined;
}

/** A nota as the portal writes it: comma, no trailing zeros. */
export function formatarNota(valor: number): string {
  return String(valor).replace(".", ",");
}

function celulasDaLinha(
  matricula: string,
  avaliacoes: readonly AvaliacaoComValor[],
  valores: readonly number[],
): NotasEditadas {
  const celulas: NotasEditadas = {};
  avaliacoes.forEach((avaliacao, indice) => {
    celulas[chaveDaNota(matricula, avaliacao.nome)] = formatarNota(valores[indice]);
  });
  return celulas;
}

export function edicoesParaNotaFinal(
  matricula: string,
  avaliacoes: readonly AvaliacaoComValor[],
  notaFinal: number,
): NotasEditadas {
  return celulasDaLinha(matricula, avaliacoes, distribuir(notaFinal, avaliacoes));
}

export function edicoesParaClassificacao(
  matricula: string,
  avaliacoes: readonly AvaliacaoComValor[],
  classificacao: Classificacao,
): NotasEditadas {
  return edicoesParaNotaFinal(
    matricula,
    avaliacoes,
    notaFinalDaClassificacao(classificacao, totalDaEtapa(avaliacoes)),
  );
}

/**
 * Editing one avaliação pins the whole row: every other cell is kept at the
 * value it shows now, so a later change of the padrão cannot move it.
 */
export function edicoesParaAvaliacao(
  valores: NotasEditadas,
  matricula: string,
  avaliacoes: readonly AvaliacaoComValor[],
  avaliacao: string,
  bruto: string,
): NotasEditadas {
  const edicoes: NotasEditadas = {};
  for (const { nome } of avaliacoes) {
    const chave = chaveDaNota(matricula, nome);
    if (valores[chave] !== undefined) edicoes[chave] = valores[chave];
  }
  edicoes[chaveDaNota(matricula, avaliacao)] = bruto;
  return edicoes;
}

/**
 * What the grid starts from: the portal's notas as they are, and generated
 * notas for every estudante with no nota in any avaliação — from their own
 * classificação, or the turma's padrão.
 */
export function notasBase(
  boletim: BoletimDaEtapa,
  classificacaoPadrao: Classificacao,
): NotasEditadas {
  const valores: NotasEditadas = {};
  const comNota = new Set<string>();

  for (const nota of boletim.notas) {
    valores[chaveDaNota(nota.matricula, nota.avaliacao)] = formatarNota(nota.valor);
    comNota.add(nota.matricula);
  }

  for (const nota of boletim.notasDoEstudante) {
    if (nota.parcial !== null) {
      valores[chaveDoEstudante(nota.matricula, "parcial")] = formatarNota(nota.parcial);
    }
    if (nota.personalizada !== null) {
      valores[chaveDoEstudante(nota.matricula, "personalizada")] = formatarNota(nota.personalizada);
    }
  }

  if (boletim.avaliacoes.length === 0) return valores;

  for (const { matricula } of boletim.estudantes) {
    if (comNota.has(matricula)) continue;
    Object.assign(
      valores,
      edicoesParaClassificacao(
        matricula,
        boletim.avaliacoes,
        boletim.classificacoes[matricula] ?? classificacaoPadrao,
      ),
    );
  }

  return valores;
}

/**
 * The nota final and classificação a row shows: the sum of its filled
 * avaliações. The nota personalizada does not enter — the screen warns about
 * it instead.
 */
export function resumoDaLinha(
  valores: NotasEditadas,
  matricula: string,
  avaliacoes: readonly AvaliacaoComValor[],
): { notaFinal: number | null; classificacao: Classificacao | null } {
  const notas = avaliacoes
    .map(({ nome }) => paraNumero(valores[chaveDaNota(matricula, nome)]))
    .filter((nota): nota is number => nota !== undefined);

  if (notas.length === 0) return { notaFinal: null, classificacao: null };

  const notaFinal = Math.round(notas.reduce((soma, nota) => soma + nota, 0) * 100) / 100;

  return { notaFinal, classificacao: classificar(notaFinal, totalDaEtapa(avaliacoes)) };
}
