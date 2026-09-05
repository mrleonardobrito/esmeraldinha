import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app';
import { getCatalogo, retomarSessao } from '../portal-sessions';
import { postAulaContent } from '../scrape/portal';
import { chatCompletion } from '../ai/openrouter';
import { OpenRouterNotConfiguredError } from '../ai/errors';

vi.mock('../portal-sessions', () => ({
  touchSession: vi.fn(),
  retomarSessao: vi.fn(),
  getCatalogo: vi.fn(),
  openSession: vi.fn(),
  closeSession: vi.fn(),
}));

vi.mock('../scrape/portal', () => ({
  postAulaContent: vi.fn(),
  // env.ts importa a URL padrão deste módulo.
  PORTAL_URL: 'https://portal.example/teste',
}));

vi.mock('../ai/openrouter', () => ({ chatCompletion: vi.fn() }));

const sessionId = 'sessao-1';
const professorId = 'prof-1';

const plano = {
  parte: 'conteudo',
  identificado: true,
  etapa: '1ª Etapa',
  turma: '3º ANO A',
  mes: 'MARÇO',
  observacao: '',
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

async function enviar(body: FormData, id = sessionId): Promise<Response> {
  return await createApp().fetch(
    new Request(`http://localhost/api/cadernetas/sessoes/${id}/envios`, {
      method: 'POST',
      body,
    }),
  );
}

function comTexto(texto: string): FormData {
  const form = new FormData();
  form.append('texto', texto);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(retomarSessao).mockResolvedValue({
    id: sessionId,
    professorId,
    login: '00000000000',
    escola: 'Escola Teste',
    page: {} as never,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  });
  vi.mocked(getCatalogo).mockResolvedValue({
    etapas: [{ nome: '1ª Etapa', turmas: ['3º ANO A'], meses: ['MARÇO'] }],
  });
  vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify(plano));
  vi.mocked(postAulaContent).mockResolvedValue({
    succeeded: ['05/03/2026 #1'],
    failed: [],
  });
});

describe('POST /api/cadernetas/sessoes/:id/envios', () => {
  it('grava o conteúdo e devolve o plano detectado com o resultado por aula', async () => {
    const response = await enviar(comTexto('Dia 05/03 ensinei adição.'));

    expect(response.status).toBe(200);
    // `ordem: null` sai do plano: quem define a ordem da aula é o portal.
    await expect(response.json()).resolves.toEqual({
      plano: { ...plano, aulas: [{ ...plano.aulas[0], ordem: undefined }] },
      resultado: { succeeded: ['05/03/2026 #1'], failed: [] },
    });
    expect(vi.mocked(postAulaContent).mock.calls[0][1]).toMatchObject({
      etapa: '1ª Etapa',
      turma: '3º ANO A',
      mes: 'MARÇO',
    });
  });

  it('devolve 404 quando a sessão não existe ou expirou', async () => {
    vi.mocked(retomarSessao).mockResolvedValue(undefined);

    const response = await enviar(comTexto('qualquer coisa'), 'sumiu');

    expect(response.status).toBe(404);
    expect(vi.mocked(chatCompletion)).not.toHaveBeenCalled();
  });

  it('devolve 400 quando não vem texto nem arquivo', async () => {
    const response = await enviar(comTexto('   '));

    expect(response.status).toBe(400);
    expect(vi.mocked(postAulaContent)).not.toHaveBeenCalled();
  });

  it('devolve 503 quando a chave do OpenRouter não está configurada', async () => {
    vi.mocked(chatCompletion).mockRejectedValue(new OpenRouterNotConfiguredError());

    const response = await enviar(comTexto('Dia 05/03 ensinei adição.'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('OPENROUTER_API_KEY'),
    });
  });

  it('devolve 422 e não grava nada quando o agente inventa uma turma', async () => {
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({ ...plano, turma: '9º ANO Z' }),
    );

    const response = await enviar(comTexto('Dia 05/03 ensinei adição.'));

    expect(response.status).toBe(422);
    expect(vi.mocked(postAulaContent)).not.toHaveBeenCalled();
  });

  it('devolve 422 quando o material é de outra parte da caderneta', async () => {
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({ ...plano, parte: 'boletim', aulas: [] }),
    );

    const response = await enviar(comTexto('Notas da 1ª etapa.'));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('boletim'),
    });
    expect(vi.mocked(postAulaContent)).not.toHaveBeenCalled();
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
    expect(vi.mocked(chatCompletion)).not.toHaveBeenCalled();
  });
});
