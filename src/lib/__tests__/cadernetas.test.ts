import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestApi } from "../api";
import {
  cadastrarCadernetas,
  loadAulasDaEtapa,
  loadBoletimDaEtapa,
  loadCaderneta,
  loadEstudantes,
  preencherNotasNoPortal,
  turmasDaCaderneta,
  type Caderneta,
} from "../cadernetas";
import { gerarRascunhos, preencherConteudosNoPortal, verificarConteudosNoPortal } from "../conteudos";
import { preverEnvio } from "../envios";

vi.mock("../api", () => ({ requestApi: vi.fn() }));

const turma = "PRÉ-ESCOLA II - C & D - INTEGRAL";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requestApi).mockImplementation(async () => new Response(JSON.stringify({ aulas: [] })));
});

describe("turma boundaries in caderneta requests", () => {
  it("keeps the selected turma on every leitura", async () => {
    await loadCaderneta("cad-1", turma);
    await loadAulasDaEtapa("cad-1", "1ª Etapa", turma);
    await loadEstudantes("cad-1", turma);
    await loadBoletimDaEtapa("cad-1", "1ª Etapa", "LÍNGUA PORTUGUESA", turma);

    for (const [address] of vi.mocked(requestApi).mock.calls) {
      const url = new URL(address, "http://localhost");
      expect(url.searchParams.get("turma")).toBe(turma);
    }
    const boletim = new URL(vi.mocked(requestApi).mock.calls[3][0], "http://localhost");
    expect(boletim.searchParams.get("disciplina")).toBe("LÍNGUA PORTUGUESA");
  });

  it("keeps notas and conteúdo preparation and verification in the selected turma", async () => {
    await preencherNotasNoPortal("cad-1", "1ª Etapa", [{ matricula: "123", avaliacao: "A", valor: 5 }], { turma });
    const aulas = [{ mes: "MARÇO", data: "02/03/2026", ordem: 1, codigoCR: "", desenvolvimento: "Aula", ferramentas: "Livro" }];
    await preencherConteudosNoPortal("cad-1", { etapa: "1ª Etapa", aulas }, turma);
    await verificarConteudosNoPortal("cad-1", { etapa: "1ª Etapa", aulas }, turma);

    for (const [address] of vi.mocked(requestApi).mock.calls) {
      expect(new URL(address, "http://localhost").searchParams.get("turma")).toBe(turma);
    }
  });

  it("sends the selected turma with chat de conteúdos and uploaded material", async () => {
    await gerarRascunhos("cad-1", "1ª Etapa", {
      mes: null, mensagens: [{ papel: "auxiliar", texto: "Escreva as aulas" }],
      rascunhos: [], referencias: [], arquivos: [],
    }, undefined, turma);
    expect(new URL(vi.mocked(requestApi).mock.calls[0][0], "http://localhost").searchParams.get("turma")).toBe(turma);

    await preverEnvio("session", { texto: "Aula", arquivos: [], cadernetaId: "cad-1", turma });
    const form = vi.mocked(requestApi).mock.calls[1][1]?.body as FormData;
    expect(form.get("turma")).toBe(turma);
    expect(form.get("cadernetaId")).toBe("cad-1");
  });

  it("lets the server combine turmas de redução automatically with no grouping flag", async () => {
    await cadastrarCadernetas({ professorId: "prof-1", sessionId: "session", turmas: ["A", "B", "C", "D", "3º ANO A"] });
    expect(JSON.parse(vi.mocked(requestApi).mock.calls[0][1]?.body as string)).toEqual({
      professorId: "prof-1", sessionId: "session", turmas: ["A", "B", "C", "D", "3º ANO A"],
    });
  });

  it("includes every member while retaining saved legacy cadernetas", () => {
    expect(turmasDaCaderneta({ turma: "A", turmas: ["A", "B"] } as Caderneta)).toEqual(["A", "B"]);
    expect(turmasDaCaderneta({ turma: "A" } as Caderneta)).toEqual(["A"]);
  });
});
