import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hasSeenWelcome, markWelcomeAsSeen } from "@/lib/welcome";

/** O `localStorage` do navegador, reduzido ao que o guia usa. */
function storageFalso(inicial: Record<string, string> = {}) {
  const dados = new Map(Object.entries(inicial));

  return {
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => {
      dados.set(chave, valor);
    },
  } as unknown as Storage;
}

function instalarStorage(storage: Storage | undefined) {
  vi.stubGlobal("localStorage", storage);
}

describe("guia de boas-vindas", () => {
  beforeEach(() => {
    instalarStorage(storageFalso());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("não foi visto antes de alguém marcar", () => {
    expect(hasSeenWelcome()).toBe(false);
  });

  it("fica visto depois de marcado", () => {
    markWelcomeAsSeen();

    expect(hasSeenWelcome()).toBe(true);
  });

  /** Sem armazenamento o guia reaparece — o que não pode é a tela quebrar. */
  it("se vira sem armazenamento nenhum", () => {
    instalarStorage(undefined);

    expect(() => markWelcomeAsSeen()).not.toThrow();
    expect(hasSeenWelcome()).toBe(false);
  });

  it("se vira com um armazenamento que lança", () => {
    instalarStorage({
      getItem: () => {
        throw new Error("acesso a dados de site bloqueado");
      },
      setItem: () => {
        throw new Error("acesso a dados de site bloqueado");
      },
    } as unknown as Storage);

    expect(() => markWelcomeAsSeen()).not.toThrow();
    expect(hasSeenWelcome()).toBe(false);
  });
});
