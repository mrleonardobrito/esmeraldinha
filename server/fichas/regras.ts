import {
  CONCEITOS,
  type Conceito,
  type Excecao,
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
    planejado: Conceito;
    escrito: Conceito;
    etapaDoPiso: 1 | 2 | 3;
  }[];
  /** Already filled in the target etapa on the portal, so left untouched. */
  jaPreenchidos: { area: number; habilidade: number; conceito: Conceito }[];
}

const posicao = (conceito: Conceito) => CONCEITOS.indexOf(conceito);

/**
 * What to write for one estudante in one etapa: R everywhere in the chosen
 * áreas, the exceções where the professor said otherwise, never below an
 * earlier etapa and never over a conceito the portal already has.
 */
export function planejarEstudante({
  lidas,
  etapa,
  areas,
  excecoes,
}: {
  lidas: readonly HabilidadeLida[];
  etapa: IndiceDaEtapa;
  areas: readonly number[];
  excecoes: readonly Excecao[];
}): PlanoDoEstudante {
  const plano: PlanoDoEstudante = { escritas: [], mantidos: [], jaPreenchidos: [] };

  for (const { area, habilidade, conceitos } of lidas) {
    if (!areas.includes(area)) continue;

    const atual = conceitos[etapa];
    if (atual !== null) {
      plano.jaPreenchidos.push({ area, habilidade, conceito: atual });
      continue;
    }

    const planejado: Conceito =
      excecoes.find((excecao) => excecao.area === area && excecao.habilidade === habilidade)
        ?.conceito ?? 'R';

    // The floor is the highest conceito of any earlier etapa.
    let piso: { conceito: Conceito; etapa: 1 | 2 | 3 } | null = null;
    for (let anterior = 1; anterior < etapa; anterior++) {
      const conceito = conceitos[anterior as IndiceDaEtapa];
      if (conceito !== null && (piso === null || posicao(conceito) >= posicao(piso.conceito))) {
        piso = { conceito, etapa: anterior as 1 | 2 | 3 };
      }
    }

    if (piso && posicao(planejado) < posicao(piso.conceito)) {
      plano.mantidos.push({ area, habilidade, planejado, escrito: piso.conceito, etapaDoPiso: piso.etapa });
      plano.escritas.push({ area, habilidade, etapa, conceito: piso.conceito });
      continue;
    }

    plano.escritas.push({ area, habilidade, etapa, conceito: planejado });
  }

  return plano;
}
