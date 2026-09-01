import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  migrateProfessoresFromLocalStorage,
  type MigrationStorage,
} from "@/lib/professores-migration";

const STORAGE_KEY = "esmeraldinha:professores";

function fakeStorage(initial?: string): MigrationStorage {
  let value: string | null = initial ?? null;
  return {
    getItem: (key) => (key === STORAGE_KEY ? value : null),
    removeItem: (key) => {
      if (key === STORAGE_KEY) value = null;
    },
  };
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const professorLegado = {
  nome: "Maria da Silva",
  login: "11144477735",
  senha: "senha-secreta",
  escola: "Escola Municipal",
};

const outroProfessorLegado = {
  nome: "João Souza",
  login: "52998224725",
  senha: "outra-senha",
  escola: "Escola Estadual",
};

describe("migrateProfessoresFromLocalStorage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing when there is nothing in storage", async () => {
    const storage = fakeStorage();

    await migrateProfessoresFromLocalStorage(storage);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("moves every professor to the API and removes the old key", async () => {
    const storage = fakeStorage(
      JSON.stringify([professorLegado, outroProfessorLegado]),
    );
    fetchMock
      .mockResolvedValueOnce(jsonResponse([])) // GET /api/professores
      .mockResolvedValueOnce(jsonResponse({ id: "1", ...professorLegado })) // POST 1
      .mockResolvedValueOnce(jsonResponse({ id: "2", ...outroProfessorLegado })); // POST 2

    await migrateProfessoresFromLocalStorage(storage);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("keeps the key intact when a create fails midway", async () => {
    const storage = fakeStorage(
      JSON.stringify([professorLegado, outroProfessorLegado]),
    );
    fetchMock
      .mockResolvedValueOnce(jsonResponse([])) // GET /api/professores
      .mockResolvedValueOnce(jsonResponse({ id: "1", ...professorLegado })) // POST 1 ok
      .mockResolvedValueOnce(
        jsonResponse({ error: "falhou" }, { status: 500 }),
      ); // POST 2 fails

    await migrateProfessoresFromLocalStorage(storage);

    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("keeps the key intact when the API is offline", async () => {
    const storage = fakeStorage(JSON.stringify([professorLegado]));
    fetchMock.mockRejectedValueOnce(new TypeError("network error"));

    await migrateProfessoresFromLocalStorage(storage);

    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("running it again does nothing and creates no duplicates", async () => {
    const storage = fakeStorage(JSON.stringify([professorLegado]));
    // Professor já existe na API (migração anterior já o moveu).
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: "1", ...professorLegado }]));

    await migrateProfessoresFromLocalStorage(storage);

    // Só a checagem via GET — nenhum POST, já que o login já existe.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("leaves corrupted data untouched", async () => {
    const storage = fakeStorage("{not json");

    await migrateProfessoresFromLocalStorage(storage);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("removes the key when storage holds no recognisable professor", async () => {
    const storage = fakeStorage(JSON.stringify([{ nada: true }]));

    await migrateProfessoresFromLocalStorage(storage);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });
});
