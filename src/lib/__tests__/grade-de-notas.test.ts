import { describe, expect, it } from "vitest";

import type { BoletimDaEtapa } from "../cadernetas";
import {
  chaveDaNota,
  chaveDoEstudante,
  edicoesParaAvaliacao,
  edicoesParaClassificacao,
  edicoesParaNotaFinal,
  formatarNota,
  notasBase,
  paraNumero,
  resumoDaLinha,
} from "../grade-de-notas";

const nomes = ["OBS", "TI", "TG", "PROVA"];
const avaliacoes = nomes.map((nome) => ({ nome, tipo: null, data: null, valor: 2.5, media: 1.5 }));

const estudante = (matricula: string) => ({
  matricula,
  nome: `ESTUDANTE ${matricula}`,
  situacao: "ATIVO",
  dataMatricula: null,
});

/**
 * 1: portal notas 2/2/2/2. 2: no notas, stored Abaixo da média. 3: nothing.
 * 4: portal nota only in OBS, plus a nota personalizada of 9.
 */
const boletim: BoletimDaEtapa = {
  etapa: "I ETAPA",
  disciplina: "MATEMÁTICA",
  disciplinas: ["MATEMÁTICA"],
  disciplinasLancadas: ["MATEMÁTICA"],
  estudantes: ["1", "2", "3", "4"].map(estudante),
  avaliacoes,
  notas: [
    ...nomes.map((avaliacao) => ({ matricula: "1", avaliacao, valor: 2 })),
    { matricula: "4", avaliacao: "OBS", valor: 1.5 },
  ],
  notasDoEstudante: [
    { matricula: "4", origem: null, calculada: 1.5, parcial: null, personalizada: 9 },
  ],
  classificacaoPadrao: "Acima da média",
  classificacoes: { "2": "Abaixo da média" },
};

const linha = (valores: Record<string, string>, matricula: string) =>
  nomes.map((avaliacao) => valores[chaveDaNota(matricula, avaliacao)]);

describe("notasBase", () => {
  it("keeps the portal notas and generates the rest from the classificação", () => {
    const base = notasBase(boletim, "Acima da média");

    expect(linha(base, "1")).toEqual(["2", "2", "2", "2"]);
    expect(linha(base, "2")).toEqual(["1,5", "1,5", "1", "1"]);
    expect(linha(base, "3")).toEqual(["2,5", "2,5", "2,5", "2,5"]);
    expect(linha(base, "4")).toEqual(["1,5", undefined, undefined, undefined]);
    expect(base[chaveDoEstudante("4", "personalizada")]).toBe("9");
  });

  it("only moves rows that follow the padrão when it changes", () => {
    const antes = notasBase(boletim, "Acima da média");
    const depois = notasBase(boletim, "Na média");

    expect(linha(depois, "3")).toEqual(["2", "2", "1,5", "1,5"]);
    for (const matricula of ["1", "2", "4"]) {
      expect(linha(depois, matricula)).toEqual(linha(antes, matricula));
    }
  });
});

describe("resumoDaLinha", () => {
  const base = notasBase(boletim, "Acima da média");

  it("sums the avaliações into the nota final and its classificação", () => {
    expect(resumoDaLinha(base, "1", avaliacoes)).toEqual({
      notaFinal: 8,
      classificacao: "Acima da média",
    });
  });

  it("ignores the nota personalizada and reads a partial row as it is", () => {
    expect(resumoDaLinha(base, "4", avaliacoes)).toEqual({
      notaFinal: 1.5,
      classificacao: "Abaixo da média",
    });
  });

  it("has nothing to say about an empty row", () => {
    expect(resumoDaLinha({}, "9", avaliacoes)).toEqual({ notaFinal: null, classificacao: null });
  });
});

describe("edições", () => {
  it("splits a nota final across the row", () => {
    expect(linha(edicoesParaNotaFinal("3", avaliacoes, 7), "3")).toEqual(["2", "2", "1,5", "1,5"]);
  });

  it("levels a classificação up to the top of its band", () => {
    expect(linha(edicoesParaClassificacao("3", avaliacoes, "Na média"), "3")).toEqual([
      "2",
      "2",
      "1,5",
      "1,5",
    ]);
  });

  it("pins the whole row when one avaliação changes", () => {
    const base = notasBase(boletim, "Acima da média");

    const edicoes = edicoesParaAvaliacao(base, "3", avaliacoes, "PROVA", "1");

    expect(linha(edicoes, "3")).toEqual(["2,5", "2,5", "2,5", "1"]);
    expect(resumoDaLinha({ ...base, ...edicoes }, "3", avaliacoes)).toEqual({
      notaFinal: 8.5,
      classificacao: "Acima da média",
    });
  });
});

describe("number formatting", () => {
  it("reads and writes the comma the auxiliar types", () => {
    expect(paraNumero("2,5")).toBe(2.5);
    expect(paraNumero("")).toBeUndefined();
    expect(formatarNota(10)).toBe("10");
    expect(formatarNota(1.5)).toBe("1,5");
  });
});
