import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O token mora num módulo com estado próprio: cada teste o reimporta para
 * começar sem sessão nenhuma.
 */
async function importar() {
  vi.resetModules();
  return {
    sessao: await import("@/lib/sessao-do-auxiliar"),
    api: await import("@/lib/api"),
  };
}

function respostaDe(status: number) {
  return vi.fn(async (_entrada: string, _init?: RequestInit) =>
    status === 200
      ? new Response("{}", { status })
      : new Response(JSON.stringify({ error: "Sessão expirada." }), { status }),
  );
}

describe("sessão do auxiliar de ensino", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("guarda, lê e esquece o token, avisando quem assinou", async () => {
    const { sessao } = await importar();
    const avisos: (string | null)[] = [];
    sessao.assinarSessao(() => avisos.push(sessao.lerToken()));

    expect(sessao.lerToken()).toBeNull();

    sessao.guardarToken("token-1");
    expect(sessao.lerToken()).toBe("token-1");

    sessao.esquecerToken();
    expect(sessao.lerToken()).toBeNull();

    expect(avisos).toEqual(["token-1", null]);
  });

  it("leva o token em toda chamada à API", async () => {
    const { sessao, api } = await importar();
    const fetchMock = respostaDe(200);
    vi.stubGlobal("fetch", fetchMock);

    sessao.guardarToken("token-1");
    await api.requestApi("/api/professores");

    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token-1");
  });

  it("esquece a sessão quando a API responde 401", async () => {
    const { sessao, api } = await importar();
    vi.stubGlobal("fetch", respostaDe(401));

    sessao.guardarToken("token-vencido");

    await expect(api.requestApi("/api/professores")).rejects.toThrow(
      "Sessão expirada.",
    );
    expect(sessao.lerToken()).toBeNull();
  });
});
