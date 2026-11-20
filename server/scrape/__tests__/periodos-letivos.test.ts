import type { Page } from 'playwright';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listConteudoOptions } from '../portal';
import { readMenuOptions } from '../primefaces';

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

function createPortal(periodosLetivos: string[], available: string[]) {
  let current = periodosLetivos[0];
  const visited: string[] = [];
  const opened: string[] = [];
  const page = {
    locator: () => ({
      dispatchEvent: async () => {},
      innerText: async () => current,
      click: async () => {},
      count: async () => 0,
    }),
    getByRole: (role: string, { name }: { name: string }) => ({
      count: async () => available.includes(current) ? 1 : 0,
      click: async () => {
        if (role === 'option') {
          current = name;
          visited.push(name);
        } else if (name === 'Etapa') {
          if (!available.includes(current)) throw new Error('Etapa menu missing');
          opened.push(current);
        }
      },
    }),
  } as unknown as Page;

  vi.mocked(readMenuOptions).mockImplementation(async (_scope, suffix) => {
    if (suffix.includes('periodoLetivo')) return periodosLetivos;
    if (suffix.includes('etapaPeriodo')) return ['1ª Etapa'];
    if (suffix.includes('turma')) return [`Turma ${current}`];
    if (suffix.includes('grupoDiario')) return ['Regular'];
    if (suffix.includes('mes')) return ['MARÇO'];
    throw new Error(`Unexpected menu: ${suffix}`);
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
    })));
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
