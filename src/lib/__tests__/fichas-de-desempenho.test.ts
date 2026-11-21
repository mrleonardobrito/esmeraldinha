import { describe, expect, it } from "vitest";

import { excecoesParaEnviar, nomeDaArea } from "@/lib/fichas-de-desempenho";

describe("nomeDaArea", () => {
  it("drops the série and the descritores prefix of fundamental áreas", () => {
    expect(nomeDaArea("1° ANO - DESCRITORES DE HABILIDADES DO COMPONENTE CURRICULAR LÍNGUA PORTUGUESA")).toBe("Língua Portuguesa");
    expect(nomeDaArea("1° ANO - DESCRITORES DE HABILIDADES DO COMPONENTE CURRICULAR: ENSINO RELIGIOSO")).toBe("Ensino Religioso");
    expect(nomeDaArea("4° ANO - DESCRITORES DE HABILIDADES SÓCIO-AFETIVOS")).toBe("Sócio-Afetivos");
  });

  it("drops the age range of educação infantil campos de experiência", () => {
    expect(nomeDaArea("O EU, O OUTRO E NÓS (EO) CRECHE-(1 ANO E 7 MESES A 3 ANOS E 11 MESES)")).toBe("O Eu, o Outro e Nós (EO)");
    expect(nomeDaArea("CORPO, GESTOS E MOVIMENTOS (CG) - CRECHE (1 ANO E 7 MESES A 3 ANOS E 11 MESES)")).toBe("Corpo, Gestos e Movimentos (CG)");
  });
});

describe("excecoesParaEnviar", () => {
  it("flattens the review per matrícula, keeping the last conceito for a repeated habilidade", () => {
    expect(excecoesParaEnviar([
      { matricula: "101", excecoes: [{ area: 0, habilidade: 1, conceito: "RD" }, { area: 0, habilidade: 1, conceito: "NR" }] },
      { matricula: "102", excecoes: [{ area: 3, habilidade: 0, conceito: "RD" }] },
      { matricula: "101", excecoes: [{ area: 1, habilidade: 0, conceito: "RD" }] },
    ])).toEqual([
      { matricula: "101", area: 0, habilidade: 1, conceito: "NR" },
      { matricula: "101", area: 1, habilidade: 0, conceito: "RD" },
      { matricula: "102", area: 3, habilidade: 0, conceito: "RD" },
    ]);
  });
});
