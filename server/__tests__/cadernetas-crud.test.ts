import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { createApp as CreateApp } from '../app';

vi.mock('../portal-sessions', () => ({
  touchSession: vi.fn(),
  retomarSessao: vi.fn(),
  getCatalogo: vi.fn(),
  getCatalogoComAvaliacoes: vi.fn(),
  openSession: vi.fn(),
  closeSession: vi.fn(),
}));

vi.mock('../ai/openrouter', () => ({ chatCompletion: vi.fn() }));

vi.mock('../scrape/portal', () => ({
  listAulas: vi.fn(),
  listBoletim: vi.fn(),
  listDisciplinas: vi.fn(),
  listEstudantes: vi.fn(),
  prepararAulaParaPreenchimento: vi.fn(),
  prepararNotasParaPreenchimento: vi.fn(),
  // env.ts importa a URL padrão deste módulo.
  PORTAL_URL: 'https://portal.example/teste',
}));

// O preenchimento assistido abriria um navegador de verdade; o que interessa
// aqui é a rota entregar a ela o conteúdo certo.
vi.mock('../sessoes-headed', () => ({
  naSessaoHeaded: vi.fn(
    async (_professorId: string, _credenciais: unknown, trabalho: (page: unknown) => unknown) =>
      trabalho({}),
  ),
}));

const sessionId = 'sessao-1';
const professorId = 'prof-1';

const catalogo = {
  etapas: [
    { nome: '1ª Etapa', turmas: ['9º ANO - 9º ANO A - VESPERTINO', '9º ANO - 9º ANO B - MATUTINO'], meses: ['MARÇO'] },
    { nome: '2ª Etapa', turmas: ['9º ANO - 9º ANO A - VESPERTINO'], meses: ['JUNHO'] },
  ],
};

const originalDbPath = process.env.ESMERALDINHA_DB_PATH;
const originalKey = process.env.ESMERALDINHA_ENCRYPTION_KEY;
let tempDir: string;

async function freshApp() {
  const { createApp } = await import('../app');
  const app = (createApp as typeof CreateApp)();

  const { createEncryptionPort } = await import('../encryption');
  const senhaEncrypted = await createEncryptionPort().encrypt('segredo');

  // Uma caderneta referencia o professor dela: sem a linha, o SQLite recusa.
  const { getDb } = await import('../professores/db');
  getDb()
    .prepare(
      `INSERT INTO professores (id, nome, login, senha_encrypted, escola, created_at)
       VALUES (?, 'Maria', '111', ?, 'Escola', '2026-01-01T00:00:00.000Z')`,
    )
    .run(professorId, senhaEncrypted);

  return app;
}

async function stubSession() {
  const { retomarSessao, getCatalogo, getCatalogoComAvaliacoes } = await import(
    '../portal-sessions'
  );
  vi.mocked(retomarSessao).mockResolvedValue({
    id: sessionId,
    professorId,
    login: '111',
    escola: 'Escola',
    page: {} as never,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  });
  vi.mocked(getCatalogo).mockResolvedValue(catalogo);
  vi.mocked(getCatalogoComAvaliacoes).mockResolvedValue(catalogo);
}

/** Toda aula que o portal devolve, para qualquer mês pedido. */
async function stubAulas(
  aulas: {
    data: string;
    ordem?: number;
    preenchida: boolean;
    codigoCR?: string;
    desenvolvimento?: string;
    ferramentas?: string;
  }[],
) {
  const { listAulas } = await import('../scrape/portal');
  vi.mocked(listAulas).mockResolvedValue(aulas);
}

/**
 * O boletim que o portal devolve para qualquer etapa e disciplina pedidas.
 * Sem disciplina, a turma não tem avaliação cadastrada.
 */
async function stubBoletim(
  boletim: {
    avaliacoes: { nome: string; valor?: number }[];
    notas: { matricula: string; avaliacao: string; valor: number }[];
  } = { avaliacoes: [], notas: [] },
  disciplinas: string[] = ['MATEMÁTICA'],
) {
  const { listBoletim, listDisciplinas } = await import('../scrape/portal');
  vi.mocked(listDisciplinas).mockResolvedValue(disciplinas);
  vi.mocked(listBoletim).mockResolvedValue({ notasDoEstudante: [], ...boletim });
}

async function stubEstudantes(
  estudantes: {
    matricula: string;
    nome: string;
    situacao?: string;
    dataMatricula?: string;
  }[] = [],
) {
  const { listEstudantes } = await import('../scrape/portal');
  vi.mocked(listEstudantes).mockResolvedValue(estudantes);
}

/**
 * O cadastro devolve na hora e raspa em segundo plano; os testes esperam essa
 * raspagem terminar antes de conferir o resultado.
 */
async function esperarSincronizacao(
  app: Awaited<ReturnType<typeof freshApp>>,
  id: string,
) {
  for (let tentativa = 0; tentativa < 50; tentativa += 1) {
    const caderneta = (await (await app.fetch(request(`/${id}`))).json()) as {
      syncStatus: string;
    };

    if (caderneta.syncStatus === 'sincronizada' || caderneta.syncStatus === 'falhou') {
      return caderneta;
    }

    await new Promise((pronto) => setTimeout(pronto, 10));
  }

  throw new Error('A sincronização não terminou a tempo.');
}

function request(path: string, init?: RequestInit) {
  // Sem barra sobrando: o Hono não casa `/api/cadernetas/` com a rota `/`.
  const base = 'http://localhost/api/cadernetas';
  return new Request(path === '/' ? base : `${base}${path}`, init);
}

function json(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function cadastrar(app: Awaited<ReturnType<typeof freshApp>>, turma = '9º ANO - 9º ANO B - MATUTINO') {
  return await app.fetch(
    request('/', json({ sessionId, professorId, turma })),
  );
}

async function cadastrarVarias(
  app: Awaited<ReturnType<typeof freshApp>>,
  turmas: string[],
) {
  return await app.fetch(request('/', json({ sessionId, professorId, turmas })));
}

describe('cadernetas CRUD', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'esmeraldinha-cadernetas-'));
    process.env.ESMERALDINHA_DB_PATH = join(tempDir, 'esmeraldinha.db');
    // `env.ts` lê a variável uma vez ao ser importado; setá-la aqui, antes de
    // qualquer import dinâmico do teste, é o que garante que o preenchimento
    // assistido consiga decifrar a senha de teste que `freshApp` grava.
    process.env.ESMERALDINHA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

    vi.resetModules();
    vi.clearAllMocks();

    await stubSession();
    await stubAulas([
      {
        data: '05/03/2026',
        ordem: 1,
        preenchida: true,
        codigoCR: '(EF15AR05) Experimentar a criação em artes visuais.',
        desenvolvimento: 'Roda de conversa sobre a festa cultural brasileira.',
        ferramentas: 'Máscaras e tinta guache.',
      },
      { data: '12/03/2026', preenchida: false },
    ]);
    await stubEstudantes([
      {
        matricula: '2026001',
        nome: 'Ana Lima',
        situacao: 'ATIVO',
        dataMatricula: '05/01/2026',
      },
    ]);
    await stubBoletim({
      avaliacoes: [{ nome: 'PROVA 1', valor: 10 }],
      notas: [{ matricula: '2026001', avaliacao: 'PROVA 1', valor: 7.5 }],
    });

    const { resetSincronizacoes } = await import('../cadernetas/sincronizacao');
    resetSincronizacoes();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.ESMERALDINHA_DB_PATH;
    else process.env.ESMERALDINHA_DB_PATH = originalDbPath;

    if (originalKey === undefined) delete process.env.ESMERALDINHA_ENCRYPTION_KEY;
    else process.env.ESMERALDINHA_ENCRYPTION_KEY = originalKey;

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('responde na hora, sem esperar a raspagem', async () => {
    const app = await freshApp();

    const response = await cadastrar(app);
    const caderneta = (await response.json()) as { turma: string; syncStatus: string };

    expect(response.status).toBe(201);
    expect(caderneta.turma).toBe('9º ANO - 9º ANO B - MATUTINO');
    // Nasce pendente: a raspagem é disparada em segundo plano.
    expect(['pendente', 'sincronizando']).toContain(caderneta.syncStatus);
  });

  it('preenche a caderneta pela raspagem em segundo plano', async () => {
    const app = await freshApp();
    const { id } = (await (await cadastrar(app)).json()) as { id: string };

    await esperarSincronizacao(app, id);

    const caderneta = (await (await app.fetch(request(`/${id}`))).json()) as {
      etapas: { nome: string; totalDeAulas: number; conteudo: string }[];
      totalDeEstudantes: number;
      syncStatus: string;
    };

    expect(caderneta.syncStatus).toBe('sincronizada');
    // A turma só existe na 1ª etapa; a 2ª entra vazia, para a grade
    // continuar mostrando as quatro colunas.
    expect(caderneta.etapas).toEqual([
      expect.objectContaining({ nome: '1ª Etapa', totalDeAulas: 2, conteudo: 'parcial' }),
      expect.objectContaining({ nome: '2ª Etapa', totalDeAulas: 0, conteudo: 'pendente' }),
    ]);
    expect(caderneta.totalDeEstudantes).toBe(1);
  });

  it('lista os estudantes da turma', async () => {
    const app = await freshApp();
    const { id } = (await (await cadastrar(app)).json()) as { id: string };
    await esperarSincronizacao(app, id);

    const response = await app.fetch(request(`/${id}/estudantes`));

    expect(await response.json()).toEqual({
      estudantes: [
        {
          matricula: '2026001',
          nome: 'Ana Lima',
          situacao: 'ATIVO',
          dataMatricula: '05/01/2026',
        },
      ],
    });
  });

  it('registra a falha da raspagem sem derrubar a caderneta', async () => {
    const { listAulas } = await import('../scrape/portal');
    vi.mocked(listAulas).mockRejectedValue(new Error('portal fora do ar'));

    const app = await freshApp();
    const { id } = (await (await cadastrar(app)).json()) as { id: string };

    const caderneta = (await esperarSincronizacao(app, id)) as {
      syncStatus: string;
      syncError: string | null;
    };

    expect(caderneta.syncStatus).toBe('falhou');
    expect(caderneta.syncError).toContain('portal fora do ar');
  });

  it('recusa uma turma que não é do professor', async () => {
    const app = await freshApp();

    const response = await cadastrar(app, '5º ANO C');

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: expect.stringContaining('não existe para este professor'),
    });
  });

  it('recusa uma turma já cadastrada', async () => {
    const app = await freshApp();
    await cadastrar(app);

    const response = await cadastrar(app);

    expect(response.status).toBe(409);
  });

  it('cadastra várias turmas de uma vez, uma caderneta para cada', async () => {
    const app = await freshApp();

    const response = await cadastrarVarias(app, [
      '9º ANO - 9º ANO A - VESPERTINO',
      '9º ANO - 9º ANO B - MATUTINO',
    ]);
    const body = (await response.json()) as {
      cadernetas: { id: string; turma: string; syncStatus: string }[];
      recusadas: unknown[];
    };

    expect(response.status).toBe(201);
    expect(body.recusadas).toEqual([]);
    expect(body.cadernetas.map((caderneta) => caderneta.turma)).toEqual([
      '9º ANO - 9º ANO A - VESPERTINO',
      '9º ANO - 9º ANO B - MATUTINO',
    ]);

    // Cada caderneta tem seu job: as duas terminam sozinhas.
    for (const caderneta of body.cadernetas) {
      const sincronizada = (await esperarSincronizacao(app, caderneta.id)) as {
        syncStatus: string;
      };
      expect(sincronizada.syncStatus).toBe('sincronizada');
    }
  });

  it('cadastra as turmas que dá e devolve o motivo das que não entraram', async () => {
    const app = await freshApp();
    await cadastrar(app, '9º ANO - 9º ANO A - VESPERTINO');

    const response = await cadastrarVarias(app, [
      // Já cadastrada acima.
      '9º ANO - 9º ANO A - VESPERTINO',
      // Não é do professor.
      '5º ANO C',
      '9º ANO - 9º ANO B - MATUTINO',
    ]);
    const body = (await response.json()) as {
      cadernetas: { turma: string }[];
      recusadas: { turma: string; motivo: string }[];
    };

    expect(response.status).toBe(201);
    expect(body.cadernetas.map((caderneta) => caderneta.turma)).toEqual([
      '9º ANO - 9º ANO B - MATUTINO',
    ]);
    expect(body.recusadas).toEqual([
      {
        turma: '9º ANO - 9º ANO A - VESPERTINO',
        motivo: expect.stringContaining('Já existe uma caderneta'),
      },
      { turma: '5º ANO C', motivo: expect.stringContaining('não existe') },
    ]);
  });

  it('recusa o pedido inteiro quando nenhuma turma entra', async () => {
    const app = await freshApp();

    const response = await cadastrarVarias(app, ['5º ANO C', '4º ANO D']);

    expect(response.status).toBe(422);
    expect((await response.json()) as { recusadas: unknown[] }).toEqual({
      error: expect.stringContaining('não existe para este professor'),
      recusadas: [
        { turma: '5º ANO C', motivo: expect.any(String) },
        { turma: '4º ANO D', motivo: expect.any(String) },
      ],
    });
  });

  it('raspa uma turma de cada vez: a página do portal é uma só', async () => {
    const { listAulas } = await import('../scrape/portal');

    let emVoo = 0;
    let simultaneasNoPico = 0;
    vi.mocked(listAulas).mockImplementation(async () => {
      emVoo += 1;
      simultaneasNoPico = Math.max(simultaneasNoPico, emVoo);
      await new Promise((pronto) => setTimeout(pronto, 5));
      emVoo -= 1;

      return [{ data: '05/03/2026', preenchida: false }];
    });

    const app = await freshApp();
    const response = await cadastrarVarias(app, [
      '9º ANO - 9º ANO A - VESPERTINO',
      '9º ANO - 9º ANO B - MATUTINO',
    ]);
    const { cadernetas } = (await response.json()) as {
      cadernetas: { id: string }[];
    };

    for (const caderneta of cadernetas) {
      await esperarSincronizacao(app, caderneta.id);
    }

    expect(simultaneasNoPico).toBe(1);
  });

  it('não cadastra sem sessão aberta', async () => {
    const { retomarSessao } = await import('../portal-sessions');
    vi.mocked(retomarSessao).mockResolvedValue(undefined);
    const app = await freshApp();

    const response = await cadastrar(app);

    expect(response.status).toBe(404);
  });

  it('lista as cadernetas do professor', async () => {
    const app = await freshApp();
    await cadastrar(app);

    const response = await app.fetch(request(`?professorId=${professorId}`));
    const lista = (await response.json()) as { turma: string }[];

    expect(response.status).toBe(200);
    expect(lista.map((caderneta) => caderneta.turma)).toEqual(['9º ANO - 9º ANO B - MATUTINO']);
  });

  it('cobra o professor na listagem', async () => {
    const app = await freshApp();

    expect((await app.fetch(request('/'))).status).toBe(400);
  });

  it('lista as turmas do professor da sessão', async () => {
    const app = await freshApp();

    const response = await app.fetch(request(`/turmas?sessionId=${sessionId}`));

    expect(await response.json()).toEqual({ turmas: ['9º ANO - 9º ANO A - VESPERTINO', '9º ANO - 9º ANO B - MATUTINO'] });
  });

  it('lista as aulas datadas de uma etapa', async () => {
    const app = await freshApp();
    const { id } = (await (await cadastrar(app)).json()) as { id: string };
    await esperarSincronizacao(app, id);

    const response = await app.fetch(
      request(`/${id}/etapas/${encodeURIComponent('1ª Etapa')}/aulas`),
    );
    const body = (await response.json()) as {
      aulas: { data: string; ordem: number | null; conteudoPreenchido: boolean }[];
    };

    expect(response.status).toBe(200);
    expect(body.aulas).toEqual([
      {
        etapa: '1ª Etapa',
        mes: 'MARÇO',
        data: '05/03/2026',
        ordem: 1,
        conteudoPreenchido: true,
        codigoCR: '(EF15AR05) Experimentar a criação em artes visuais.',
        desenvolvimento: 'Roda de conversa sobre a festa cultural brasileira.',
        ferramentas: 'Máscaras e tinta guache.',
      },
      {
        etapa: '1ª Etapa',
        mes: 'MARÇO',
        data: '12/03/2026',
        ordem: null,
        conteudoPreenchido: false,
        // O portal não escreveu nada nessa linha.
        codigoCR: null,
        desenvolvimento: null,
        ferramentas: null,
      },
    ]);
  });

  it('devolve 404 nas aulas de uma caderneta inexistente', async () => {
    const app = await freshApp();

    const response = await app.fetch(request('/nao-existe/etapas/1/aulas'));

    expect(response.status).toBe(404);
  });

  it('sincroniza relendo o portal', async () => {
    const app = await freshApp();
    const { id } = (await (await cadastrar(app)).json()) as { id: string };
    await esperarSincronizacao(app, id);

    await stubAulas([
      { data: '05/03/2026', ordem: 1, preenchida: true },
      { data: '12/03/2026', preenchida: true },
      { data: '19/03/2026', preenchida: true },
    ]);

    const { resetSincronizacoes } = await import('../cadernetas/sincronizacao');
    resetSincronizacoes();

    const response = await app.fetch(request(`/${id}/sincronizacoes`, json({ sessionId })));
    expect(response.status).toBe(202);

    await esperarSincronizacao(app, id);
    const caderneta = (await (await app.fetch(request(`/${id}`))).json()) as {
      etapas: { totalDeAulas: number; conteudo: string }[];
    };

    expect(caderneta.etapas[0]).toMatchObject({ totalDeAulas: 3, conteudo: 'concluido' });
  });

  it('marca a aula gravada quando o preenchimento assistido do envio é confirmado', async () => {
    const app = await freshApp();
    const { id } = (await (await cadastrar(app)).json()) as { id: string };
    await esperarSincronizacao(app, id);

    const { chatCompletion } = await import('../ai/openrouter');
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        parte: 'conteudo',
        identificado: true,
        etapa: '1ª Etapa',
        turma: '9º ANO - 9º ANO B - MATUTINO',
        mes: 'MARÇO',
        observacao: '',
        aulas: [
          {
            data: '12/03/2026',
            ordem: null,
            codigoCR: 'EF09MA01',
            desenvolvimento: 'Equações do 2º grau.',
            ferramentas: 'Quadro.',
            isRecuperacao: 'Não',
            isInteracao: 'Não',
          },
        ],
      }),
    );

    const form = new FormData();
    form.append('texto', 'Aula de 12/03/2026.');
    form.append('cadernetaId', id);

    const preview = await app.fetch(
      new Request(`http://localhost/api/cadernetas/sessoes/${sessionId}/envios`, {
        method: 'POST',
        body: form,
      }),
    );
    expect(preview.status).toBe(200);
    const { plano } = (await preview.json()) as {
      plano: { etapa: string; mes: string; turma: string; aulas: { data: string; ordem: number | null }[] };
    };

    const response = await app.fetch(
      request(
        `/sessoes/${sessionId}/envios/aulas/preenchimentos-assistidos`,
        json({
          professorId,
          cadernetaId: id,
          etapa: plano.etapa,
          mes: plano.mes,
          turma: plano.turma,
          aula: plano.aulas[0],
        }),
      ),
    );

    expect(response.status).toBe(200);

    const aulas = (await (
      await app.fetch(request(`/${id}/etapas/${encodeURIComponent('1ª Etapa')}/aulas`))
    ).json()) as { aulas: { data: string; conteudoPreenchido: boolean }[] };

    expect(aulas.aulas.find((aula) => aula.data === '12/03/2026')?.conteudoPreenchido).toBe(true);
  });

  it('exclui a caderneta', async () => {
    const app = await freshApp();
    const { id } = (await (await cadastrar(app)).json()) as { id: string };

    expect((await app.fetch(request(`/${id}`, { method: 'DELETE' }))).status).toBe(204);
    expect((await app.fetch(request(`/${id}`))).status).toBe(404);
  });

  it('devolve o boletim da etapa com as avaliações e as notas do portal', async () => {
    const app = await freshApp();
    const { id } = (await (await cadastrar(app)).json()) as { id: string };
    await esperarSincronizacao(app, id);

    const response = await app.fetch(request(`/${id}/etapas/1%C2%AA%20Etapa/boletim`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      etapa: '1ª Etapa',
      disciplina: 'MATEMÁTICA',
      disciplinas: ['MATEMÁTICA'],
      estudantes: [{ matricula: '2026001', nome: 'Ana Lima' }],
      avaliacoes: [{ nome: 'PROVA 1', valor: 10 }],
      notas: [{ matricula: '2026001', avaliacao: 'PROVA 1', valor: 7.5 }],
    });
  });

  it('conta o progresso do boletim como estudantes × avaliações', async () => {
    const app = await freshApp();
    const { id } = (await (await cadastrar(app)).json()) as { id: string };
    await esperarSincronizacao(app, id);

    const caderneta = (await (await app.fetch(request(`/${id}`))).json()) as {
      etapas: { totalDeNotas: number; notasLancadas: number; boletim: string }[];
    };

    // Uma estudante e uma avaliação: uma nota possível, e ela já está lançada.
    expect(caderneta.etapas[0]).toMatchObject({
      totalDeNotas: 1,
      notasLancadas: 1,
      boletim: 'concluido',
    });
  });

  it('devolve 404 no boletim de uma caderneta inexistente', async () => {
    const app = await freshApp();

    const response = await app.fetch(request('/nao-existe/etapas/1/boletim'));

    expect(response.status).toBe(404);
  });
});
