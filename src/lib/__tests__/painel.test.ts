import { describe, expect, it } from "vitest";

import type { Caderneta, EtapaDaCaderneta, StatusDaParte } from "@/lib/cadernetas";
import {
  cadernetasParaRetomar,
  descreverQuando,
  progressoDaCaderneta,
  resumoDoPainel,
  situacaoDaCaderneta,
  type ItemDoPainel,
} from "@/lib/painel";
import type { Professor } from "@/lib/professores";

function etapa(
  nome: string,
  conteudo: StatusDaParte,
  boletim: StatusDaParte,
  contagens: Partial<EtapaDaCaderneta> = {},
): EtapaDaCaderneta {
  return {
    nome,
    meses: [],
    totalDeAulas: 0,
    aulasPreenchidas: 0,
    conteudo,
    totalDeNotas: 0,
    notasLancadas: 0,
    boletim,
    ...contagens,
  };
}

function caderneta(
  id: string,
  etapas: EtapaDaCaderneta[],
  extras: Partial<Caderneta> = {},
): Caderneta {
  return {
    id,
    professorId: "prof-1",
    turma: "PRÉ-ESCOLA II - PRÉ-ESCOLA II - C - INTEGRAL",
    turno: "INTEGRAL",
    etapas,
    totalDeEstudantes: 20,
    createdAt: "2026-02-01T12:00:00.000Z",
    syncedAt: "2026-03-01T12:00:00.000Z",
    syncStatus: "sincronizada",
    syncError: null,
    ...extras,
  };
}

const professor: Professor = {
  id: "prof-1",
  nome: "Maria Esmeralda da Silva",
  login: "11144477735",
  escola: "E.M. Limoeiro de Anadia",
  imagem: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("situação da caderneta", () => {
  it("é a fazer enquanto nenhuma parte saiu do pendente", () => {
    const sem = caderneta("c1", [
      etapa("1ª etapa", "pendente", "pendente"),
      etapa("2ª etapa", "pendente", "pendente"),
    ]);

    expect(situacaoDaCaderneta(sem)).toBe("a-fazer");
  });

  /** A raspagem ainda não terminou: não há o que estar em andamento. */
  it("é a fazer quando o portal ainda não trouxe etapa nenhuma", () => {
    expect(situacaoDaCaderneta(caderneta("c1", []))).toBe("a-fazer");
  });

  it("é feita só quando conteúdo e boletim de todas as etapas fecharam", () => {
    const fechada = caderneta("c1", [
      etapa("1ª etapa", "concluido", "concluido"),
      etapa("2ª etapa", "concluido", "concluido"),
    ]);
    const quase = caderneta("c2", [
      etapa("1ª etapa", "concluido", "concluido"),
      etapa("2ª etapa", "concluido", "parcial"),
    ]);

    expect(situacaoDaCaderneta(fechada)).toBe("feita");
    expect(situacaoDaCaderneta(quase)).toBe("em-andamento");
  });

  it("conta como em andamento o que está sendo preenchido agora", () => {
    const processando = caderneta("c1", [
      etapa("1ª etapa", "processando", "pendente"),
    ]);

    expect(situacaoDaCaderneta(processando)).toBe("em-andamento");
  });
});

describe("progresso da caderneta", () => {
  /** Conteúdo e boletim pesam igual, mesmo com contagens de tamanhos diferentes. */
  it("tira a média entre aulas e notas em vez de somar tudo", () => {
    const meia = caderneta("c1", [
      etapa("1ª etapa", "concluido", "pendente", {
        totalDeAulas: 10,
        aulasPreenchidas: 10,
        totalDeNotas: 200,
        notasLancadas: 0,
      }),
    ]);

    expect(progressoDaCaderneta(meia)).toBe(0.5);
  });

  it("é zero quando o portal ainda não disse quantas aulas ou notas existem", () => {
    expect(progressoDaCaderneta(caderneta("c1", [etapa("1ª etapa", "pendente", "pendente")]))).toBe(0);
  });
});

describe("resumo do painel", () => {
  it("separa as cadernetas nas três contagens e soma as aulas", () => {
    const resumo = resumoDoPainel([
      caderneta("c1", [etapa("1ª etapa", "pendente", "pendente", { totalDeAulas: 10 })]),
      caderneta("c2", [
        etapa("1ª etapa", "parcial", "pendente", {
          totalDeAulas: 10,
          aulasPreenchidas: 5,
        }),
      ]),
      caderneta("c3", [
        etapa("1ª etapa", "concluido", "concluido", {
          totalDeAulas: 10,
          aulasPreenchidas: 10,
          totalDeNotas: 4,
          notasLancadas: 4,
        }),
      ]),
    ]);

    expect(resumo).toMatchObject({
      total: 3,
      aFazer: 1,
      emAndamento: 1,
      feitas: 1,
      aulasPreenchidas: 15,
      totalDeAulas: 30,
    });
    // (0 + 0,5 + 1) / 3: a de c2 está na metade das aulas, e o boletim dela
    // não puxa a média para baixo porque não há nota nenhuma a lançar.
    expect(resumo.progresso).toBeCloseTo((0 + 0.5 + 1) / 3, 5);
  });

  it("não divide por zero quando não há caderneta nenhuma", () => {
    expect(resumoDoPainel([])).toMatchObject({ total: 0, progresso: 0 });
  });
});

describe("cadernetas para retomar", () => {
  function item(id: string, syncedAt: string | null): ItemDoPainel {
    return {
      professor,
      caderneta: caderneta(
        id,
        [
          etapa("1ª etapa", "concluido", "concluido"),
          etapa("2ª etapa", "parcial", "pendente", {
            totalDeAulas: 10,
            aulasPreenchidas: 4,
          }),
        ],
        { syncedAt },
      ),
    };
  }

  it("traz as mexidas por último primeiro, e diz em que etapa pararam", () => {
    const lista = cadernetasParaRetomar([
      item("antiga", "2026-03-01T12:00:00.000Z"),
      item("recente", "2026-05-01T12:00:00.000Z"),
    ]);

    expect(lista.map((atual) => atual.caderneta.id)).toEqual(["recente", "antiga"]);
    expect(lista[0].etapa).toBe("2ª etapa");
  });

  it("deixa de fora o que não está em andamento", () => {
    const feita: ItemDoPainel = {
      professor,
      caderneta: caderneta("feita", [etapa("1ª etapa", "concluido", "concluido")]),
    };

    expect(cadernetasParaRetomar([feita])).toEqual([]);
  });

  it("respeita o limite pedido", () => {
    const itens = [
      item("a", "2026-05-01T12:00:00.000Z"),
      item("b", "2026-04-01T12:00:00.000Z"),
      item("c", "2026-03-01T12:00:00.000Z"),
    ];

    expect(cadernetasParaRetomar(itens, 2)).toHaveLength(2);
  });
});

describe("descrever quando", () => {
  const agora = new Date("2026-05-10T12:00:00.000Z");

  it("data a última leitura em palavras", () => {
    expect(descreverQuando("2026-05-08T12:00:00.000Z", agora)).toBe("anteontem");
    expect(descreverQuando("2026-05-03T12:00:00.000Z", agora)).toBe("semana passada");
    expect(descreverQuando("2026-05-10T11:30:00.000Z", agora)).toBe("há 30 minutos");
  });

  it("diz que ainda não leu quando não há data", () => {
    expect(descreverQuando(null, agora)).toBe("ainda não lida");
  });
});
