import { describe, expect, it } from "vitest";

import { nomeDaArea, pendenciasAntesDeAbrir, previaConfere, proximoConceito } from "@/lib/fichas-de-desempenho";

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

describe("proximoConceito", () => {
  it("cycles R → RD → NR → R", () => {
    expect(proximoConceito("R")).toBe("RD");
    expect(proximoConceito("RD")).toBe("NR");
    expect(proximoConceito("NR")).toBe("R");
  });
});

describe("pendenciasAntesDeAbrir", () => {
  it("only an unresolved name with exceções blocks opening the portal", () => {
    expect(pendenciasAntesDeAbrir([{ excecoes: [] }])).toBe(0);
    expect(pendenciasAntesDeAbrir([{ excecoes: [] }, { excecoes: [{ area: 0, habilidade: 0, conceito: "RD" }] }])).toBe(1);
  });
});

describe("previaConfere", () => {
  const previa = { etapas: [1, 2, 3, 4] as (1 | 2 | 3 | 4)[], areas: [0, 3] };

  it("is true when the checked etapas and áreas are the prévia's, in any order", () => {
    expect(previaConfere(previa, [4, 3, 2, 1], [3, 0])).toBe(true);
  });

  it("is false when an etapa or área was checked or unchecked after the prévia", () => {
    expect(previaConfere(previa, [1, 2], [0, 3])).toBe(false);
    expect(previaConfere(previa, [1, 2, 3, 4], [0])).toBe(false);
  });
});
