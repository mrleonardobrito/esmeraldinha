import { beforeEach, describe, expect, it } from "vitest";

import {
  esquecerSessaoDeTrabalho,
  guardarSessaoDeTrabalho,
  lerSessaoDeTrabalho,
} from "@/lib/sessao-de-trabalho";
import type { Caderneta } from "@/lib/cadernetas";
import type { Professor } from "@/lib/professores";

const professor: Professor = {
  id: "prof-1",
  nome: "Maria da Silva",
  login: "11144477735",
  escola: "E.M. Esmeralda",
  imagem: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const session = { sessionId: "sess-1", escola: "E.M. Esmeralda", expiresInMs: 60_000 };

const cadernetas = [{ id: "cad-1", turma: "PRÉ-ESCOLA II - C" } as Caderneta];

describe("sessão de trabalho", () => {
  beforeEach(() => {
    esquecerSessaoDeTrabalho();
  });

  it("não tem nada a retomar antes de a tela guardar algo", () => {
    expect(lerSessaoDeTrabalho()).toBeNull();
  });

  it("devolve o professor, a sessão e as cadernetas que a tela deixou", () => {
    guardarSessaoDeTrabalho({ professor, session, cadernetas });

    expect(lerSessaoDeTrabalho()).toEqual({ professor, session, cadernetas });
  });

  /** Encerrar a sessão não tira o professor da tela: só o portal cai. */
  it("guarda o professor sem sessão depois de desconectar", () => {
    guardarSessaoDeTrabalho({ professor, session, cadernetas });
    guardarSessaoDeTrabalho({ professor, session: null, cadernetas });

    expect(lerSessaoDeTrabalho()?.session).toBeNull();
    expect(lerSessaoDeTrabalho()?.professor).toEqual(professor);
  });

  it("esquece tudo ao trocar de professor", () => {
    guardarSessaoDeTrabalho({ professor, session, cadernetas });
    esquecerSessaoDeTrabalho();

    expect(lerSessaoDeTrabalho()).toBeNull();
  });
});
