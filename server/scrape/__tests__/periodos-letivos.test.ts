import type { Page } from 'playwright';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listConteudoOptions } from '../portal';
import { readMenuOptions, selectMenuOption } from '../primefaces';

vi.mock('@playwright/test', () => ({
  expect: () => ({
    toBeVisible: async () => {},
    toBeHidden: async () => {},
  }),
}));

vi.mock('../primefaces', () => ({
  closeMenuPanel: vi.fn(async () => {}),
  fillField: vi.fn(),
  readMenuOptions: vi.fn(),
  selectMenuOption: vi.fn(async () => 'updated'),
  waitForAjax: vi.fn(async () => {}),
  AJAX_TIMEOUT_MS: 20_000,
}));

function createPortal(periodosLetivos: string[], available: string[], gruposDiarios?: Record<string, string[]>) {
  let current = periodosLetivos[0];
  let turma: string | undefined;
  const visited: string[] = [];
  const opened: string[] = [];
  const page = {
    locator: () => ({
      dispatchEvent: async () => {},
      innerText: async () => current,
      click: async () => {},
      count: async () => 0,
    }),
    getByRole: (role: string, { name }: { name: string | RegExp }) => ({
      count: async () => available.includes(current) ? 1 : 0,
      click: async () => {
        if (role === 'option' && typeof name === 'string') {
          current = name;
          visited.push(name);
        } else if (name instanceof RegExp && name.test('Etapa \uf107')) {
          if (!available.includes(current)) throw new Error('Etapa menu missing');
          opened.push(current);
        }
      },
    }),
  } as unknown as Page;

  vi.mocked(readMenuOptions).mockImplementation(async (_scope, suffix) => {
    if (suffix.includes('periodoLetivo')) return periodosLetivos;
    if (suffix.includes('etapaPeriodo')) return ['1ª Etapa'];
    if (suffix.includes('turma')) return gruposDiarios ? Object.keys(gruposDiarios) : [`Turma ${current}`];
    if (suffix.includes('grupoDiario')) return gruposDiarios?.[turma ?? ''] ?? ['Regular'];
    if (suffix.includes('mes')) return ['MARÇO'];
    throw new Error(`Unexpected menu: ${suffix}`);
  });
  vi.mocked(selectMenuOption).mockImplementation(async (_page, _scope, suffix, label) => {
    if (suffix.includes('periodoLetivo') && label) {
      current = label;
      visited.push(label);
    }
    if (suffix.includes('turma') && label) turma = label;
    return 'updated';
  });

  return { page, visited, opened };
}

beforeEach(() => vi.clearAllMocks());

describe('searching all períodos letivos', () => {
  it('continues past períodos letivos without Etapa and keeps turmas from every available one', async () => {
    const periodosLetivos = ['TESTE 2025', '2026 EJA', '2026', 'Outro período', 'TESTE EJA 2025'];
    const available = ['2026 EJA', 'Outro período'];
    const { page, visited, opened } = createPortal(periodosLetivos, available);

    const catalogo = await listConteudoOptions(page);

    expect(visited).toEqual(periodosLetivos);
    expect(opened).toEqual(available);
    expect(catalogo.etapas).toEqual(available.map((periodoLetivo) => ({
      nome: '1ª Etapa',
      periodoLetivo,
      turmas: [`Turma ${periodoLetivo}`],
      meses: ['MARÇO'],
      gruposDiariosPorTurma: [{ turma: `Turma ${periodoLetivo}`, grupoDiario: 'Regular' }],
    })));
  });

  it('reads the grupo diário of every turma and does not infer ambiguous relationships', async () => {
    const { page } = createPortal(['2026'], ['2026'], {
      'Turma A': ['Regular'],
      'Turma B': ['REDUÇÃO TARDE'],
      'Turma C': [],
      'Turma D': ['Regular', 'REDUÇÃO MANHÃ'],
    });

    const catalogo = await listConteudoOptions(page);

    expect(catalogo.etapas[0].gruposDiariosPorTurma).toEqual([
      { turma: 'Turma A', grupoDiario: 'Regular' },
      { turma: 'Turma B', grupoDiario: 'REDUÇÃO TARDE' },
      { turma: 'Turma C', grupoDiario: null },
      { turma: 'Turma D', grupoDiario: null },
    ]);
    expect(catalogo.etapas[0].meses).toEqual(['MARÇO']);
    expect(vi.mocked(selectMenuOption).mock.calls
      .filter(([, , suffix]) => suffix.includes('turma'))
      .map(([, , , label]) => label)).toEqual(['Turma A', 'Turma B', 'Turma C', 'Turma D']);
  });

  it('returns an empty catalogo when no período letivo offers Etapa', async () => {
    const periodosLetivos = ['TESTE 2025', '2026 EJA', '2026'];
    const { page, visited, opened } = createPortal(periodosLetivos, []);

    expect(await listConteudoOptions(page)).toEqual({ etapas: [] });
    expect(visited).toEqual(periodosLetivos);
    expect(opened).toEqual([]);
  });

  it('propagates unexpected failures instead of reporting an empty catalogo', async () => {
    const { page } = createPortal(['2026'], ['2026']);
    vi.mocked(readMenuOptions).mockImplementation(async (_scope, suffix) => {
      if (suffix.includes('periodoLetivo')) return ['2026'];
      throw new Error('Portal unavailable');
    });

    await expect(listConteudoOptions(page)).rejects.toThrow('Portal unavailable');
  });
});
