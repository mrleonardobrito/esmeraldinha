import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { createApp as CreateApp } from '../app';
import { autenticar } from './sessao-de-teste';

vi.mock('../portal-sessions', () => ({
  touchSession: vi.fn(),
  retomarSessao: vi.fn(),
  getCatalogo: vi.fn(),
  openSession: vi.fn(),
  closeSession: vi.fn(),
  donoDaSessao: vi.fn(),
}));

vi.mock('../ai/openrouter', () => ({ chatCompletion: vi.fn() }));

vi.mock('../scrape/ficha-de-desempenho', () => ({ lerEstruturaDaFicha: vi.fn() }));

vi.mock('../sessoes-headed', () => ({ naSessaoHeaded: vi.fn() }));

vi.mock('../fichas/preenchimento-assistido', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../fichas/preenchimento-assistido')>()),
  acompanharPreenchimento: vi.fn(),
}));

const turma = 'CRECHE II - CRECHE II - VESPERTINO';
const estrutura = {
  ficha: 'FICHA DESCRITIVA EDUCAÇÃO INFANTIL - CRECHE II - Todas disciplinas',
  areas: [
    { indice: 0, titulo: 'O EU, O OUTRO E NÓS (EO)', habilidades: [{ indice: 0, numero: '1°', texto: 'Demonstra cuidado.' }] },
    { indice: 1, titulo: 'CORPO, GESTOS E MOVIMENTOS (CG)', habilidades: [{ indice: 0, numero: '1°', texto: 'Explora.' }] },
  ],
};

const originalDbPath = process.env.ESMERALDINHA_DB_PATH;
const originalKey = process.env.ESMERALDINHA_ENCRYPTION_KEY;
let tempDir: string;

function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost/api/cadernetas${path}`, init);
}

function json(body: unknown, method = 'POST'): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function freshApp() {
  const { createApp } = await import('../app');
  const app = (createApp as typeof CreateApp)();
  const { createEncryptionPort } = await import('../encryption');
  const { getDb } = await import('../professores/db');
  const { createProfessor } = await import('../professores/store');
  const { createCaderneta, syncCaderneta } = await import('../cadernetas/store');

  const { id: professorId } = await createProfessor(getDb(), createEncryptionPort(), {
    nome: 'Maria', login: '111', senha: 'segredo', escola: 'Escola',
  });
  const caderneta = createCaderneta(getDb(), { professorId, turma });
  syncCaderneta(getDb(), caderneta.id, {
    etapas: [{ nome: 'I ETAPA', meses: ['MARÇO'], aulas: [] }],
    estudantes: [
      { matricula: '10315', nome: 'ANA RUTHE IZABELLY DA SILVA', situacao: 'ATIVO', dataMatricula: null },
      { matricula: '10316', nome: 'JOÃO PEDRO SANTOS', situacao: 'TRANSFERIDO', dataMatricula: null },
    ],
  });

  return { app: await autenticar(app), professorId, cadernetaId: caderneta.id };
}

describe('ficha de desempenho routes', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'esmeraldinha-ficha-'));
    process.env.ESMERALDINHA_DB_PATH = join(tempDir, 'esmeraldinha.db');
    process.env.ESMERALDINHA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    vi.resetModules();
    vi.clearAllMocks();

    const { openSession } = await import('../portal-sessions');
    vi.mocked(openSession).mockResolvedValue({ id: 'leitura-1', page: {} } as never);
    const { lerEstruturaDaFicha } = await import('../scrape/ficha-de-desempenho');
    vi.mocked(lerEstruturaDaFicha).mockResolvedValue(estrutura);
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.ESMERALDINHA_DB_PATH;
    else process.env.ESMERALDINHA_DB_PATH = originalDbPath;
    if (originalKey === undefined) delete process.env.ESMERALDINHA_ENCRYPTION_KEY;
    else process.env.ESMERALDINHA_ENCRYPTION_KEY = originalKey;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reads the structure from the portal once and serves it from the cache', async () => {
    const { app, cadernetaId } = await freshApp();

    const antes = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/estrutura`));
    expect(await antes.json()).toEqual({ estrutura: null });

    const leitura = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/estrutura/leituras`, { method: 'POST' }));
    expect(leitura.status).toBe(200);
    expect((await leitura.json()).estrutura).toMatchObject(estrutura);

    const { closeSession } = await import('../portal-sessions');
    expect(closeSession).toHaveBeenCalledWith('leitura-1');

    const depois = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/estrutura`));
    expect((await depois.json()).estrutura).toMatchObject(estrutura);
  });

  async function comEstrutura() {
    const ctx = await freshApp();
    await ctx.app.fetch(request(`/${ctx.cadernetaId}/ficha-de-desempenho/estrutura/leituras`, { method: 'POST' }));
    return ctx;
  }

  function formDaPrevia(etapas: number[] = [1, 2, 3, 4], areas: number[] = [0]) {
    const form = new FormData();
    form.append('areas', JSON.stringify(areas));
    form.append('etapas', JSON.stringify(etapas));
    form.append('texto', 'Ana tem dificuldade em cuidar dos colegas, melhorou na III etapa.');
    return form;
  }

  async function agenteDevolve(resposta: unknown) {
    const { chatCompletion } = await import('../ai/openrouter');
    vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify(resposta));
  }

  const anaComDificuldade = {
    resposta: 'ok',
    estudantes: [{ estudante: 'Ana Ruthe', matricula: '', excecoes: [{ area: 0, habilidade: 0, conceito: 'RD', trecho: 'Ana', etapas: [1, 2] }] }],
    gerais: [],
  };

  it('refuses a prévia before the structure was read', async () => {
    const { app, cadernetaId } = await freshApp();

    const response = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/previas`, { method: 'POST', body: formDaPrevia() }));

    expect(response.status).toBe(422);
  });

  it('generates the prévia for the four etapas with the agent’s exceções on their etapas', async () => {
    const { app, cadernetaId } = await comEstrutura();
    await agenteDevolve(anaComDificuldade);

    const response = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/previas`, { method: 'POST', body: formDaPrevia() }));

    expect(response.status).toBe(200);
    const { previa } = await response.json();
    expect(previa.etapas).toEqual([1, 2, 3, 4]);
    expect(previa.estudantes.map((e: { matricula: string }) => e.matricula)).toEqual(['10315', '10316']);
    expect(previa.estudantes[0].conceitos).toEqual({ '0.0': ['RD', 'RD', 'R', 'R'] });
    expect(previa.estudantes[0].trechos).toEqual(['Ana']);
    expect(previa.estudantes[1].conceitos).toEqual({ '0.0': ['R', 'R', 'R', 'R'] });
  });

  it('keeps the edits of the prévia and re-normalizes a decreasing row', async () => {
    const { app, cadernetaId } = await comEstrutura();
    await agenteDevolve(anaComDificuldade);
    await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/previas`, { method: 'POST', body: formDaPrevia() }));

    const edicao = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/previas/atual`, json({
      estudantes: [{ matricula: '10315', conceitos: { '0.0': ['R', 'NR', 'NR', 'R'] } }],
      gerais: [],
      naoResolvidos: [],
    }, 'PUT')));
    expect(edicao.status).toBe(200);

    const atual = await (await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/previas/atual`))).json();
    expect(atual.previa.estudantes[0].conceitos['0.0']).toEqual(['R', 'R', 'R', 'R']);
    expect(atual.previa.estudantes[1].conceitos['0.0']).toEqual(['R', 'R', 'R', 'R']);
  });

  it('refuses an edit for a matrícula outside the prévia', async () => {
    const { app, cadernetaId } = await comEstrutura();
    await agenteDevolve(anaComDificuldade);
    await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/previas`, { method: 'POST', body: formDaPrevia() }));

    const edicao = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/previas/atual`, json({
      estudantes: [{ matricula: '99999', conceitos: { '0.0': ['R', 'R', 'R', 'R'] } }],
      gerais: [],
      naoResolvidos: [],
    }, 'PUT')));

    expect(edicao.status).toBe(422);
  });

  it('discards the prévia', async () => {
    const { app, cadernetaId } = await comEstrutura();
    await agenteDevolve(anaComDificuldade);
    await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/previas`, { method: 'POST', body: formDaPrevia() }));

    const apagada = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/previas/atual`, { method: 'DELETE' }));
    expect(apagada.status).toBe(204);
    const atual = await (await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/previas/atual`))).json();
    expect(atual.previa).toBeNull();
  });

  it('refuses to fill without a prévia', async () => {
    const { app, cadernetaId } = await comEstrutura();

    const response = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/preenchimentos-assistidos`, { method: 'POST' }));

    expect(response.status).toBe(422);
  });

  it('refuses to fill while unresolved names still carry exceções', async () => {
    const { app, cadernetaId } = await comEstrutura();
    await agenteDevolve({
      resposta: '',
      estudantes: [{ estudante: 'Carlos', matricula: '', excecoes: [{ area: 0, habilidade: 0, conceito: 'RD', trecho: 'Carlos', etapas: [] }] }],
      gerais: [],
    });
    await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/previas`, { method: 'POST', body: formDaPrevia() }));

    const response = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/preenchimentos-assistidos`, { method: 'POST' }));

    expect(response.status).toBe(422);
  });

  it('refuses to fill a prévia whose áreas are gone from the ficha', async () => {
    const { app, cadernetaId, professorId } = await comEstrutura();
    await agenteDevolve(anaComDificuldade);
    await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/previas`, { method: 'POST', body: formDaPrevia() }));
    const { getDb } = await import('../professores/db');
    const { salvarEstruturaDaFicha } = await import('../fichas/store');
    salvarEstruturaDaFicha(getDb(), professorId, turma, { ...estrutura, areas: [estrutura.areas[1]] });

    const response = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/preenchimentos-assistidos`, { method: 'POST' }));

    expect(response.status).toBe(422);
  });

  it('starts the assisted run from the saved prévia and reports its state', async () => {
    const { app, cadernetaId, professorId } = await comEstrutura();
    await agenteDevolve(anaComDificuldade);
    await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/previas`, { method: 'POST', body: formDaPrevia() }));
    const { naSessaoHeaded } = await import('../sessoes-headed');
    vi.mocked(naSessaoHeaded).mockImplementation(async (_id, _cred, trabalho) => trabalho({} as never));
    const { acompanharPreenchimento } = await import('../fichas/preenchimento-assistido');
    vi.mocked(acompanharPreenchimento).mockImplementation((_page, _plano, onEstado) => {
      onEstado({ status: 'aguardando-auxiliar', etapa: 'I a IV ETAPA', total: 1, atual: { matricula: '10315', nome: 'ANA' }, preenchidos: [], pulados: [], erro: null });
      return new Promise(() => {});
    });

    const inicio = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/preenchimentos-assistidos`, { method: 'POST' }));

    expect(inicio.status).toBe(202);
    expect(naSessaoHeaded).toHaveBeenCalledWith(professorId, expect.objectContaining({ login: '111' }), expect.any(Function));
    const plano = vi.mocked(acompanharPreenchimento).mock.calls[0][1];
    expect(plano).toMatchObject({ turma, etapas: [1, 2, 3, 4], areas: [0] });
    expect(plano.fichas.get('10315')).toEqual({ '0.0': ['RD', 'RD', 'R', 'R'] });

    const estado = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/preenchimentos-assistidos/atual`));
    expect((await estado.json()).estado).toMatchObject({ status: 'aguardando-auxiliar', atual: { matricula: '10315' } });

    const outro = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/preenchimentos-assistidos`, { method: 'POST' }));
    expect(outro.status).toBe(409);
  });
  it('fills with the current situação of each estudante, not the one saved in the prévia', async () => {
    const { app, cadernetaId } = await comEstrutura();
    await agenteDevolve(anaComDificuldade);
    await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/previas`, { method: 'POST', body: formDaPrevia() }));
    const { getDb } = await import('../professores/db');
    const { syncCaderneta } = await import('../cadernetas/store');
    syncCaderneta(getDb(), cadernetaId, {
      etapas: [{ nome: 'I ETAPA', meses: ['MARÇO'], aulas: [] }],
      estudantes: [
        { matricula: '10315', nome: 'ANA RUTHE IZABELLY DA SILVA', situacao: 'TRANSFERIDO', dataMatricula: null },
        { matricula: '10316', nome: 'JOÃO PEDRO SANTOS', situacao: 'TRANSFERIDO', dataMatricula: null },
        { matricula: '10400', nome: 'NOVA ESTUDANTE', situacao: 'ATIVO', dataMatricula: null },
      ],
    });
    const { naSessaoHeaded } = await import('../sessoes-headed');
    vi.mocked(naSessaoHeaded).mockImplementation(async (_id, _cred, trabalho) => trabalho({} as never));
    const { acompanharPreenchimento } = await import('../fichas/preenchimento-assistido');
    vi.mocked(acompanharPreenchimento).mockImplementation(() => new Promise(() => {}));

    const inicio = await app.fetch(request(`/${cadernetaId}/ficha-de-desempenho/preenchimentos-assistidos`, { method: 'POST' }));

    expect(inicio.status).toBe(202);
    const plano = vi.mocked(acompanharPreenchimento).mock.calls[0][1];
    expect(plano.estudantes).toEqual([
      { matricula: '10315', nome: 'ANA RUTHE IZABELLY DA SILVA', situacao: 'TRANSFERIDO' },
      { matricula: '10316', nome: 'JOÃO PEDRO SANTOS', situacao: 'TRANSFERIDO' },
      { matricula: '10400', nome: 'NOVA ESTUDANTE', situacao: 'ATIVO' },
    ]);
    expect(plano.fichas.has('10400')).toBe(false);
  });
});
