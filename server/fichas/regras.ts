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
  /** Planned below an earlier etapa: the earlier conceito was written instead. */
  mantidos: {
    area: number;
    habilidade: number;
    etapa: IndiceDaEtapa;
    planejado: Conceito;
    escrito: Conceito;
    etapaDoPiso: 1 | 2 | 3;
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

      const escrito: Conceito = piso && posicao(planejado) < posicao(piso.conceito) ? piso.conceito : planejado;
      if (piso && escrito !== planejado) {
        plano.mantidos.push({ area, habilidade, etapa, planejado, escrito, etapaDoPiso: piso.etapa });
      }
      plano.escritas.push({ area, habilidade, etapa, conceito: escrito });
      piso = comPiso(piso, escrito, etapa);
    }
  }

  return plano;
}
