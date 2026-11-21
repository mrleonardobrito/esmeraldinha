import { describe, expect, it } from 'vitest';

import { indiceDaEtapa } from '../../../shared/ficha-de-desempenho';
import { planejarEstudante, type HabilidadeLida } from '../regras';

const vazio = { 1: null, 2: null, 3: null, 4: null } as const;

function lida(area: number, habilidade: number, conceitos: Partial<HabilidadeLida['conceitos']> = {}): HabilidadeLida {
  return { area, habilidade, conceitos: { ...vazio, ...conceitos } };
}

const duasAreas = [lida(0, 0), lida(0, 1), lida(1, 0)];

describe('planejarEstudante', () => {
  it('writes R in every habilidade of the chosen áreas when there are no exceções', () => {
    const plano = planejarEstudante({ lidas: duasAreas, etapa: 1, areas: [0], excecoes: [] });

    expect(plano.escritas).toEqual([
      { area: 0, habilidade: 0, etapa: 1, conceito: 'R' },
      { area: 0, habilidade: 1, etapa: 1, conceito: 'R' },
    ]);
    expect(plano.mantidos).toEqual([]);
    expect(plano.jaPreenchidos).toEqual([]);
  });

  it('applies RD and NR exceções', () => {
    const plano = planejarEstudante({
      lidas: duasAreas,
      etapa: 2,
      areas: [0, 1],
      excecoes: [
        { area: 0, habilidade: 1, conceito: 'RD' },
        { area: 1, habilidade: 0, conceito: 'NR' },
      ],
    });

    expect(plano.escritas).toEqual([
      { area: 0, habilidade: 0, etapa: 2, conceito: 'R' },
      { area: 0, habilidade: 1, etapa: 2, conceito: 'RD' },
      { area: 1, habilidade: 0, etapa: 2, conceito: 'NR' },
    ]);
  });

  it('never decreases: RD planned after R in I ETAPA writes R and reports mantido', () => {
    const plano = planejarEstudante({
      lidas: [lida(0, 0, { 1: 'R' })],
      etapa: 2,
      areas: [0],
      excecoes: [{ area: 0, habilidade: 0, conceito: 'RD' }],
    });

    expect(plano.escritas).toEqual([{ area: 0, habilidade: 0, etapa: 2, conceito: 'R' }]);
    expect(plano.mantidos).toEqual([
      { area: 0, habilidade: 0, planejado: 'RD', escrito: 'R', etapaDoPiso: 1 },
    ]);
  });

  it('uses the highest earlier conceito as floor, ignoring blanks', () => {
    const plano = planejarEstudante({
      lidas: [lida(0, 0, { 1: 'NR', 3: 'RD' })],
      etapa: 4,
      areas: [0],
      excecoes: [{ area: 0, habilidade: 0, conceito: 'NR' }],
    });

    expect(plano.escritas).toEqual([{ area: 0, habilidade: 0, etapa: 4, conceito: 'RD' }]);
    expect(plano.mantidos).toEqual([
      { area: 0, habilidade: 0, planejado: 'NR', escrito: 'RD', etapaDoPiso: 3 },
    ]);
  });

  it('never overwrites the target etapa', () => {
    const plano = planejarEstudante({
      lidas: [lida(0, 0, { 2: 'NR' })],
      etapa: 2,
      areas: [0],
      excecoes: [],
    });

    expect(plano.escritas).toEqual([]);
    expect(plano.jaPreenchidos).toEqual([{ area: 0, habilidade: 0, conceito: 'NR' }]);
  });

  it('ignores exceções outside the chosen áreas', () => {
    const plano = planejarEstudante({
      lidas: duasAreas,
      etapa: 1,
      areas: [0],
      excecoes: [{ area: 1, habilidade: 0, conceito: 'NR' }],
    });

    expect(plano.escritas.some((escrita) => escrita.area === 1)).toBe(false);
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
