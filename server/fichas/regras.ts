import {
  CONCEITOS,
  chaveDaHabilidade,
  type Conceito,
  type FichaPlanejada,
  type IndiceDaEtapa,
} from '../../shared/ficha-de-desempenho';

/** What the portal shows for one habilidade in each etapa; null is blank. */
export type ConceitosLidos = Record<IndiceDaEtapa, Conceito | null>;

export interface HabilidadeLida {
  area: number;
  habilidade: number;
  conceitos: ConceitosLidos;
}

export interface Escrita {
  area: number;
  habilidade: number;
  etapa: IndiceDaEtapa;
  conceito: Conceito;
}

export interface PlanoDoEstudante {
  escritas: Escrita[];
  /**
   * Planned conceitos that would have made the ficha decrease between etapas:
   * below an earlier etapa, or above a later one already on the portal. The
   * conceito of `etapaDeReferencia` was written instead.
   */
  mantidos: {
    area: number;
    habilidade: number;
    etapa: IndiceDaEtapa;
    planejado: Conceito;
    escrito: Conceito;
    etapaDeReferencia: IndiceDaEtapa;
  }[];
  /** Already filled on the portal in an etapa of the run, so left untouched. */
  jaPreenchidos: { area: number; habilidade: number; etapa: IndiceDaEtapa; conceito: Conceito }[];
}

const posicao = (conceito: Conceito) => CONCEITOS.indexOf(conceito);

/**
 * What to write for one estudante: the planned ficha in every etapa of the
 * run, walking the etapas in order. A conceito the portal already has is
 * kept and, like every conceito written before it, is a floor: a later etapa
 * is never written below the highest conceito of the etapas before it.
 */
export function planejarEstudante({
  lidas,
  etapas,
  planejada,
}: {
  lidas: readonly HabilidadeLida[];
  etapas: readonly IndiceDaEtapa[];
  planejada: FichaPlanejada;
}): PlanoDoEstudante {
  const plano: PlanoDoEstudante = { escritas: [], mantidos: [], jaPreenchidos: [] };

  for (const { area, habilidade, conceitos } of lidas) {
    const linha = planejada[chaveDaHabilidade(area, habilidade)];
    if (!linha) continue;

    type Piso = { conceito: Conceito; etapa: 1 | 2 | 3 };
    let piso: Piso | null = null;
    const comPiso = (atual: Piso | null, conceito: Conceito, etapa: IndiceDaEtapa): Piso | null =>
      etapa < 4 && (atual === null || posicao(conceito) >= posicao(atual.conceito))
        ? { conceito, etapa: etapa as 1 | 2 | 3 }
        : atual;

    for (const etapa of [1, 2, 3, 4] as const) {
      const noPortal = conceitos[etapa];
      const planejado = linha[etapa - 1];
      const naExecucao = etapas.includes(etapa) && planejado !== null && planejado !== undefined;

      if (noPortal !== null) {
        if (naExecucao) plano.jaPreenchidos.push({ area, habilidade, etapa, conceito: noPortal });
        piso = comPiso(piso, noPortal, etapa);
        continue;
      }
      if (!naExecucao) continue;

      // The ceiling is the lowest conceito a later etapa already has on the
      // portal: writing above it would make the ficha decrease there.
      let teto: { conceito: Conceito; etapa: IndiceDaEtapa } | null = null;
      for (const depois of [2, 3, 4] as const) {
        const valor = conceitos[depois];
        if (depois > etapa && valor !== null && (teto === null || posicao(valor) < posicao(teto.conceito))) {
          teto = { conceito: valor, etapa: depois };
        }
      }

      let escrito: Conceito = planejado;
      let referencia: IndiceDaEtapa | null = null;
      if (piso && posicao(escrito) < posicao(piso.conceito)) {
        escrito = piso.conceito;
        referencia = piso.etapa;
      }
      // When the portal itself already decreases (an earlier etapa above a
      // later one), the earlier etapa wins: the floor is not lowered.
      if (teto && posicao(escrito) > posicao(teto.conceito) && (!piso || posicao(piso.conceito) <= posicao(teto.conceito))) {
        escrito = teto.conceito;
        referencia = teto.etapa;
      }
      if (referencia !== null && escrito !== planejado) {
        plano.mantidos.push({ area, habilidade, etapa, planejado, escrito, etapaDeReferencia: referencia });
      }
      plano.escritas.push({ area, habilidade, etapa, conceito: escrito });
      piso = comPiso(piso, escrito, etapa);
    }
  }

  return plano;
}
