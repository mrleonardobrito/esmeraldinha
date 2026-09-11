import { describe, expect, it } from "vitest";

import { diffDePalavras } from "@/lib/diff-de-palavras";

const remontado = (trechos: { texto: string }[]) => trechos.map((t) => t.texto).join("");

describe("diffDePalavras", () => {
  it("marca o trecho acrescentado no meio e devolve o texto novo inteiro", () => {
    const trechos = diffDePalavras(
      "Produção de texto: planejamento e escrita.",
      "Produção de texto: leitura em voz alta, planejamento e escrita.",
    );

    expect(remontado(trechos)).toBe(
      "Produção de texto: leitura em voz alta, planejamento e escrita.",
    );
    expect(trechos.filter((t) => t.novo).map((t) => t.texto)).toEqual([
      "leitura em voz alta, ",
    ]);
  });

  it("não marca nada quando os textos são iguais", () => {
    const trechos = diffDePalavras("Leitura da fábula.", "Leitura da fábula.");

    expect(trechos).toEqual([{ texto: "Leitura da fábula.", novo: false }]);
  });

  it("marca tudo quando não havia texto antes", () => {
    expect(diffDePalavras("", "Nova aula.")).toEqual([{ texto: "Nova aula.", novo: true }]);
  });

  it("marca uma palavra trocada, sem arrastar os espaços vizinhos", () => {
    const trechos = diffDePalavras("Caderno, quadro e giz.", "Caderno, quadro e cartaz.");

    expect(trechos).toEqual([
      { texto: "Caderno, quadro e ", novo: false },
      { texto: "cartaz.", novo: true },
    ]);
  });
});
