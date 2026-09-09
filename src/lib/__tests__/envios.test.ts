import { describe, expect, it } from "vitest";

import { achatarNotasResolvidas, resolverNotasDoEstudante } from "../envios";

describe("notas do upload inteligente", () => {
  const notas = [
    { avaliacao: "OBSERVAÇÃO", valor: 1.5 },
    { avaliacao: "TRABALHO INDIVIDUAL", valor: 2.1 },
    { avaliacao: "TRABALHO EM GRUPO", valor: 1.1 },
    { avaliacao: "ACOMPANHAMENTO", valor: 1.5 },
  ];

  it("aplica a matrícula confirmada a todas as avaliações do estudante", () => {
    expect(resolverNotasDoEstudante("13062", notas)).toEqual([
      { matricula: "13062", avaliacao: "OBSERVAÇÃO", valor: 1.5 },
      { matricula: "13062", avaliacao: "TRABALHO INDIVIDUAL", valor: 2.1 },
      { matricula: "13062", avaliacao: "TRABALHO EM GRUPO", valor: 1.1 },
      { matricula: "13062", avaliacao: "ACOMPANHAMENTO", valor: 1.5 },
    ]);
  });

  it("achata os grupos resolvidos e ignora estudantes ainda pendentes", () => {
    const resolvidas = resolverNotasDoEstudante("13062", notas);

    expect(achatarNotasResolvidas([resolvidas, null])).toEqual(resolvidas);
  });
});
