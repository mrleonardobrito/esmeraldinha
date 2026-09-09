import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { utils, write } from 'xlsx';

import type { createApp as CreateApp } from '../app';
import { autenticar } from './sessao-de-teste';

vi.mock('../portal-sessions', () => ({
  touchSession: vi.fn(),
  retomarSessao: vi.fn(),
  getCatalogo: vi.fn(),
  openSession: vi.fn(),
  closeSession: vi.fn(),
}));

vi.mock('../scrape/portal', () => ({
  prepararAulaParaPreenchimento: vi.fn(),
  prepararNotasParaPreenchimento: vi.fn(),
  // env.ts importa a URL padrão deste módulo.
  PORTAL_URL: 'https://portal.example/teste',
}));

vi.mock('../ai/openrouter', () => ({ chatCompletion: vi.fn() }));

const sessionId = 'sessao-1';
const professorId = 'prof-1';
const turma = '3º ANO A';

const planoDeConteudo = {
  parte: 'conteudo',
  identificado: true,
  etapa: '1ª Etapa',
  turma,
  mes: 'MARÇO',
  observacao: '',
  disciplina: '',
  notas: [],
  aulas: [
    {
      data: '05/03/2026',
      ordem: null,
      codigoCR: 'EF03MA01',
      desenvolvimento: 'Adição com reagrupamento.',
      ferramentas: 'Quadro.',
      isRecuperacao: 'Não',
      isInteracao: 'Não',
    },
  ],
};

const originalDbPath = process.env.ESMERALDINHA_DB_PATH;
let tempDir: string;

function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost/api/cadernetas${path}`, init);
}

async function enviar(body: FormData, id = sessionId): Promise<Response> {
  const { createApp } = await import('../app');
  // A rota exige uma sessão do auxiliar de ensino: o helper entra uma vez e
  // devolve o mesmo `fetch`, com o token na requisição.
  const app = await autenticar((createApp as typeof CreateApp)());
  return await app.fetch(
    request(`/sessoes/${id}/envios`, { method: 'POST', body }),
  );
}

function comTexto(texto: string): FormData {
  const form = new FormData();
  form.append('texto', texto);
  return form;
}

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'esmeraldinha-envios-'));
  process.env.ESMERALDINHA_DB_PATH = join(tempDir, 'esmeraldinha.db');

  vi.resetModules();
  vi.clearAllMocks();

  const { retomarSessao, getCatalogo } = await import('../portal-sessions');
  vi.mocked(retomarSessao).mockResolvedValue({
    id: sessionId,
    professorId,
    login: '00000000000',
    escola: 'Escola Teste',
    page: {} as never,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  });
  const catalogo = {
    etapas: [{ nome: '1ª Etapa', turmas: [turma], meses: ['MARÇO'] }],
  };
  vi.mocked(getCatalogo).mockResolvedValue(catalogo);

  const { chatCompletion } = await import('../ai/openrouter');
  vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify(planoDeConteudo));
});

afterEach(() => {
  if (originalDbPath === undefined) delete process.env.ESMERALDINHA_DB_PATH;
  else process.env.ESMERALDINHA_DB_PATH = originalDbPath;

  rmSync(tempDir, { recursive: true, force: true });
});

describe('POST /api/cadernetas/sessoes/:id/envios', () => {
  it('devolve o plano detectado com um item pronto por aula, sem gravar nada', async () => {
    const response = await enviar(comTexto('Dia 05/03 ensinei adição.'));

    expect(response.status).toBe(200);
    // `ordem: null` sai do plano: quem define a ordem da aula é o portal.
    await expect(response.json()).resolves.toEqual({
      plano: {
        ...planoDeConteudo,
        aulas: [{
          data: planoDeConteudo.aulas[0].data,
          codigoCR: planoDeConteudo.aulas[0].codigoCR,
          desenvolvimento: planoDeConteudo.aulas[0].desenvolvimento,
          ferramentas: planoDeConteudo.aulas[0].ferramentas,
          isRecuperacao: planoDeConteudo.aulas[0].isRecuperacao,
          isInteracao: planoDeConteudo.aulas[0].isInteracao,
        }],
      },
      itens: [{ status: 'pronta', rotulo: '05/03/2026' }],
    });

    const { prepararAulaParaPreenchimento, prepararNotasParaPreenchimento } = await import(
      '../scrape/portal'
    );
    expect(prepararAulaParaPreenchimento).not.toHaveBeenCalled();
    expect(prepararNotasParaPreenchimento).not.toHaveBeenCalled();
  });

  it('devolve 404 quando a sessão não existe ou expirou', async () => {
    const { retomarSessao } = await import('../portal-sessions');
    vi.mocked(retomarSessao).mockResolvedValue(undefined);

    const response = await enviar(comTexto('qualquer coisa'), 'sumiu');

    expect(response.status).toBe(404);
    const { chatCompletion } = await import('../ai/openrouter');
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('devolve 400 quando não vem texto nem arquivo', async () => {
    const response = await enviar(comTexto('   '));

    expect(response.status).toBe(400);
  });

  it('devolve 503 quando a chave do OpenRouter não está configurada', async () => {
    const { chatCompletion } = await import('../ai/openrouter');
    const { OpenRouterNotConfiguredError } = await import('../ai/errors');
    vi.mocked(chatCompletion).mockRejectedValue(new OpenRouterNotConfiguredError());

    const response = await enviar(comTexto('Dia 05/03 ensinei adição.'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('OPENROUTER_API_KEY'),
    });
  });

  it('devolve 422 quando o agente inventa uma turma', async () => {
    const { chatCompletion } = await import('../ai/openrouter');
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({ ...planoDeConteudo, turma: '9º ANO Z' }),
    );

    const response = await enviar(comTexto('Dia 05/03 ensinei adição.'));

    expect(response.status).toBe(422);
  });

  it('devolve 422 quando o material é de outra parte da caderneta', async () => {
    const { chatCompletion } = await import('../ai/openrouter');
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({ ...planoDeConteudo, parte: 'frequencia', aulas: [] }),
    );

    const response = await enviar(comTexto('Presença da 1ª etapa.'));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('frequência'),
    });
  });

  it('lê uma planilha .xlsx e manda o conteúdo como texto ao agente', async () => {
    const planilha = utils.book_new();
    utils.book_append_sheet(
      planilha,
      utils.aoa_to_sheet([
        ['estudante', 'nota'],
        ['Maria', 8.5],
      ]),
      'Notas',
    );
    const data = write(planilha, { type: 'array', bookType: 'xlsx' }) as Uint8Array;

    const form = new FormData();
    form.append(
      'arquivos',
      new File([new Uint8Array(data)], 'notas.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );

    const response = await enviar(form);

    expect(response.status).toBe(200);
    const { chatCompletion } = await import('../ai/openrouter');
    const content = vi.mocked(chatCompletion).mock.calls[0][0].content;
    expect(content).toEqual([
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('Maria,8.5'),
      }),
    ]);
  });

  it('devolve 422 quando o arquivo de Word está corrompido', async () => {
    const form = new FormData();
    form.append(
      'arquivos',
      new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])], 'plano.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    );

    const response = await enviar(form);

    expect(response.status).toBe(422);
  });

  it('recusa um arquivo maior que o limite antes de chamar o agente', async () => {
    const form = new FormData();
    form.append(
      'arquivos',
      new File([new Uint8Array(11 * 1024 * 1024)], 'gigante.png', {
        type: 'image/png',
      }),
    );

    const response = await enviar(form);

    expect(response.status).toBe(413);
    const { chatCompletion } = await import('../ai/openrouter');
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  describe('boletim', () => {
    const planoDeBoletim = {
      parte: 'boletim',
      identificado: true,
      etapa: '1ª Etapa',
      turma,
      mes: 'MARÇO',
      observacao: '',
      disciplina: 'MATEMÁTICA',
      aulas: [],
      notas: [
        {
          estudante: 'Ana Lima',
          matricula: '',
          notas: [
            { avaliacao: 'PROVA 1', valor: 8.5 },
            { avaliacao: 'TRABALHO INDIVIDUAL', valor: 9 },
            { avaliacao: 'TRABALHO EM GRUPO', valor: 7.5 },
            { avaliacao: 'ACOMPANHAMENTO', valor: 10 },
          ],
        },
        {
          estudante: 'Alguém que não existe',
          matricula: '',
          notas: [{ avaliacao: 'PROVA 1', valor: 7 }],
        },
      ],
    };

    async function cadastrarCadernetaComEstudantes() {
      const { getDb } = await import('../professores/db');
      const { createCaderneta } = await import('../cadernetas/store');
      const db = getDb();

      db.prepare(
        `INSERT INTO professores (id, nome, login, senha_encrypted, escola, created_at)
         VALUES (?, 'Maria', '111', X'00', 'Escola', '2026-01-01T00:00:00.000Z')`,
      ).run(professorId);

      const caderneta = createCaderneta(db, { professorId, turma });

      db.prepare(
        `INSERT INTO caderneta_estudantes (caderneta_id, matricula, nome, ordem)
         VALUES (?, ?, ?, 0)`,
      ).run(caderneta.id, '2026001', 'Ana Lima');

      db.prepare(
        `INSERT INTO caderneta_disciplinas (caderneta_id, nome, posicao)
         VALUES (?, 'MATEMÁTICA', 0)`,
      ).run(caderneta.id);

      // O catálogo que o agente recebe sai daqui: é a sincronização da
      // caderneta que traz as avaliações da turma.
      const inserirAvaliacao = db.prepare(
        `INSERT INTO caderneta_avaliacoes
           (caderneta_id, etapa, disciplina, nome, tipo, data, valor, media, posicao)
         VALUES (?, '1ª Etapa', 'MATEMÁTICA', ?, NULL, NULL, NULL, NULL, ?)`,
      );
      ['PROVA 1', 'TRABALHO INDIVIDUAL', 'TRABALHO EM GRUPO', 'ACOMPANHAMENTO']
        .forEach((avaliacao, indice) => inserirAvaliacao.run(caderneta.id, avaliacao, indice));

      return caderneta;
    }

    it('resolve as notas contra os estudantes da caderneta e reporta quem não bateu', async () => {
      const caderneta = await cadastrarCadernetaComEstudantes();

      const { chatCompletion } = await import('../ai/openrouter');
      vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify(planoDeBoletim));

      const form = new FormData();
      form.append('texto', 'Notas da prova 1.');
      form.append('cadernetaId', caderneta.id);

      const response = await enviar(form);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        cadernetaId: caderneta.id,
        itens: [
          { status: 'pronta', rotulo: '2026001' },
          {
            status: 'falha',
            rotulo: 'Alguém que não existe',
            motivo: expect.stringContaining('Nenhum estudante'),
          },
        ],
      });

      const { prepararNotasParaPreenchimento } = await import('../scrape/portal');
      expect(prepararNotasParaPreenchimento).not.toHaveBeenCalled();
    });

    it('preserva todas as avaliações e marca com null o estudante que não casou', async () => {
      const caderneta = await cadastrarCadernetaComEstudantes();

      const { chatCompletion } = await import('../ai/openrouter');
      vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify(planoDeBoletim));

      const form = new FormData();
      form.append('texto', 'Notas da prova 1.');
      form.append('cadernetaId', caderneta.id);

      const response = await enviar(form);

      // O grupo mantém as quatro colunas da planilha. A linha não resolvida
      // continua no mesmo índice como null para poder ser corrigida na preview.
      await expect(response.json()).resolves.toMatchObject({
        notasResolvidas: [
          [
            { matricula: '2026001', avaliacao: 'PROVA 1', valor: 8.5 },
            { matricula: '2026001', avaliacao: 'TRABALHO INDIVIDUAL', valor: 9 },
            { matricula: '2026001', avaliacao: 'TRABALHO EM GRUPO', valor: 7.5 },
            { matricula: '2026001', avaliacao: 'ACOMPANHAMENTO', valor: 10 },
          ],
          null,
        ],
      });
    });

    it('devolve 422 quando a turma do boletim ainda não foi sincronizada', async () => {
      const { chatCompletion } = await import('../ai/openrouter');
      vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify(planoDeBoletim));

      const response = await enviar(comTexto('Notas da prova 1.'));

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining('avaliação cadastrada'),
      });
    });
  });
});
