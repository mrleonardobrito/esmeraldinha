import { describe, expect, it } from 'vitest';

import { indiceDaEtapa } from '../../../shared/ficha-de-desempenho';
import { planejarEstudante, type HabilidadeLida } from '../regras';

const vazio = { 1: null, 2: null, 3: null, 4: null } as const;

function lida(area: number, habilidade: number, conceitos: Partial<HabilidadeLida['conceitos']> = {}): HabilidadeLida {
  return { area, habilidade, conceitos: { ...vazio, ...conceitos } };
}

describe('planejarEstudante', () => {
  it('writes the planned row in every chosen etapa', () => {
    const plano = planejarEstudante({
      lidas: [lida(0, 0)],
      etapas: [1, 2, 3, 4],
      planejada: { '0.0': ['RD', 'RD', 'R', 'R'] },
    });

    expect(plano.escritas).toEqual([
      { area: 0, habilidade: 0, etapa: 1, conceito: 'RD' },
      { area: 0, habilidade: 0, etapa: 2, conceito: 'RD' },
      { area: 0, habilidade: 0, etapa: 3, conceito: 'R' },
      { area: 0, habilidade: 0, etapa: 4, conceito: 'R' },
    ]);
    expect(plano.mantidos).toEqual([]);
  });

  it('keeps a portal conceito and raises later planned etapas to it', () => {
    const plano = planejarEstudante({
      lidas: [lida(0, 0, { 1: 'R' })],
      etapas: [1, 2, 3, 4],
      planejada: { '0.0': ['RD', 'RD', 'R', 'R'] },
    });

    expect(plano.jaPreenchidos).toEqual([{ area: 0, habilidade: 0, etapa: 1, conceito: 'R' }]);
    expect(plano.escritas.map((e) => [e.etapa, e.conceito])).toEqual([[2, 'R'], [3, 'R'], [4, 'R']]);
    expect(plano.mantidos).toEqual([{ area: 0, habilidade: 0, etapa: 2, planejado: 'RD', escrito: 'R', etapaDeReferencia: 1 }]);
  });

  it('uses a portal conceito outside the run as floor', () => {
    const plano = planejarEstudante({
      lidas: [lida(0, 0, { 1: 'RD' })],
      etapas: [3],
      planejada: { '0.0': [null, null, 'NR', null] },
    });

    expect(plano.escritas).toEqual([{ area: 0, habilidade: 0, etapa: 3, conceito: 'RD' }]);
    expect(plano.mantidos[0]).toMatchObject({ etapa: 3, planejado: 'NR', escrito: 'RD', etapaDeReferencia: 1 });
  });

  it('caps earlier etapas at a lower conceito a later etapa already has on the portal', () => {
    const plano = planejarEstudante({
      lidas: [lida(0, 0, { 3: 'RD' })],
      etapas: [1, 2, 3, 4],
      planejada: { '0.0': ['R', 'R', 'R', 'R'] },
    });

    expect(plano.escritas.map((e) => [e.etapa, e.conceito])).toEqual([[1, 'RD'], [2, 'RD'], [4, 'R']]);
    expect(plano.mantidos).toEqual([
      { area: 0, habilidade: 0, etapa: 1, planejado: 'R', escrito: 'RD', etapaDeReferencia: 3 },
      { area: 0, habilidade: 0, etapa: 2, planejado: 'R', escrito: 'RD', etapaDeReferencia: 3 },
    ]);
  });

  it('never writes etapas outside the run', () => {
    const plano = planejarEstudante({
      lidas: [lida(0, 0)],
      etapas: [2],
      planejada: { '0.0': ['R', 'R', 'R', 'R'] },
    });

    expect(plano.escritas).toEqual([{ area: 0, habilidade: 0, etapa: 2, conceito: 'R' }]);
  });

  it('skips habilidades not in the planned ficha', () => {
    const plano = planejarEstudante({
      lidas: [lida(0, 0), lida(1, 0)],
      etapas: [1],
      planejada: { '0.0': ['R', null, null, null] },
    });

    expect(plano.escritas.every((e) => e.area === 0)).toBe(true);
  });
});

describe('indiceDaEtapa', () => {
  it('maps the portal etapa names to 1–4', () => {
    expect(indiceDaEtapa('I ETAPA')).toBe(1);
    expect(indiceDaEtapa('III ETAPA')).toBe(3);
  });

  it('throws for an unknown etapa', () => {
    expect(() => indiceDaEtapa('5ª ETAPA')).toThrow();
  });
});
