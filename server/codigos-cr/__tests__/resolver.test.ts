import { describe, expect, it } from 'vitest';

import { resolverCodigoCR } from '../resolver';
import type { CodigoCR } from '../store';

const CATALOGO: Record<string, string> = {
  EF15AR01:
    'Identificar e apreciar formas distintas das artes visuais tradicionais e ' +
    'contemporâneas, cultivando a percepção, o imaginário, a capacidade de ' +
    'simbolizar e o repertório imagético.',
  EF03MA06:
    'Resolver e elaborar problemas de adição e subtração com os significados ' +
    'de juntar, acrescentar, separar, retirar, comparar e completar ' +
    'quantidades, utilizando diferentes estratégias de cálculo exato ou ' +
    'aproximado, incluindo cálculo mental.',
  EF03GE01:
    'Identificar e comparar aspectos culturais dos grupos sociais de seus ' +
    'lugares de vivência, seja na cidade, seja no campo.',
};

const buscar = (codigo: string): CodigoCR | null =>
  CATALOGO[codigo] ? { codigo, texto: CATALOGO[codigo] } : null;

describe('resolverCodigoCR', () => {
  it('troca o texto do professor pelo oficial da habilidade', () => {
    expect(resolverCodigoCR('EF03GE01', buscar)).toBe(
      `(EF03GE01) ${CATALOGO.EF03GE01}`,
    );
  });

  it('devolve uma linha por habilidade quando a aula tem várias', () => {
    const lido = '(EF03MA06) - Resolve e elabora problemas. (EF03GE01) - Identifica lugares.';

    expect(resolverCodigoCR(lido, buscar)).toBe(
      `(EF03MA06) ${CATALOGO.EF03MA06}\n(EF03GE01) ${CATALOGO.EF03GE01}`,
    );
  });

  it('não repete a paráfrase que o professor fez da própria habilidade', () => {
    // O material real reescreve a habilidade no infinitivo pessoal; o texto
    // oficial já diz tudo isso, então nada é acrescentado.
    const lido =
      '(EF03GE01) - Identifica e compara aspectos culturais dos grupos ' +
      'sociais de seus lugares de vivência, seja na cidade, seja no campo.';

    expect(resolverCodigoCR(lido, buscar)).toBe(`(EF03GE01) ${CATALOGO.EF03GE01}`);
  });

  it('preserva o trecho do professor que acrescenta algo ao oficial', () => {
    const lido = 'Contextos e práticas. (EF15AR01)';

    expect(resolverCodigoCR(lido, buscar)).toBe(
      `(EF15AR01) ${CATALOGO.EF15AR01}\nContextos e práticas.`,
    );
  });

  it('deixa como veio o código que não está no catálogo', () => {
    const lido = 'EF09XX99 - Uma habilidade que o catálogo não tem.';

    expect(resolverCodigoCR(lido, buscar)).toBe(lido);
  });

  it('deixa como veio o texto sem nenhum código', () => {
    expect(resolverCodigoCR('Aula de revisão para a prova.', buscar)).toBe(
      'Aula de revisão para a prova.',
    );
  });

  it('reconhece o código em caixa baixa e não repete o repetido', () => {
    expect(resolverCodigoCR('ef03ge01 e de novo EF03GE01', buscar)).toBe(
      `(EF03GE01) ${CATALOGO.EF03GE01}`,
    );
  });

  it('devolve string vazia quando não há nada escrito', () => {
    expect(resolverCodigoCR('   ', buscar)).toBe('');
  });
});
