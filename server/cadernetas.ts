import { Hono } from 'hono';
import { z } from 'zod';

import { LoginError, MissingAulaRowsError } from './scrape/errors';
import {
  closeSession,
  getCatalogo,
  openSession,
  touchSession,
} from './portal-sessions';
import { postAulaContent } from './scrape/portal';
import {
  EnvioInvalidoError,
  OpenRouterError,
  OpenRouterNotConfiguredError,
  ParteNaoSuportadaError,
} from './ai/errors';
import { interpretarEnvio, type ArquivoEnviado } from './ai/interpretar-envio';
import { env } from './env';

const credentialsSchema = z.object({
  login: z.string().trim().min(1),
  senha: z.string().min(1),
  escola: z.string().trim().min(1),
});

export const cadernetas = new Hono();

cadernetas.post('/sessoes', async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);

  if (!parsed.success) {
    return context.json({ error: 'Credenciais do professor incompletas.' }, 400);
  }

  const { login, senha, escola } = parsed.data;

  try {
    const session = await openSession({
      login: login,
      senha: senha,
      escola: escola,
    });

    return context.json(
      {
        sessionId: session.id,
        escola: session.escola,
        expiresInMs: env.sessionIdleMs,
      },
      201,
    );
  } catch (error) {
    if (error instanceof LoginError) {
      return context.json({ error: error.message }, 401);
    }

    console.error('Falha ao abrir sessão no portal:', error);
    return context.json(
      { error: 'Não foi possível acessar o portal. Tente novamente em instantes.' },
      502,
    );
  }
});

cadernetas.get('/sessoes/:id', (context) => {
  const session = touchSession(context.req.param('id'));

  if (!session) {
    return context.json({ error: 'Sessão não encontrada ou expirada.' }, 404);
  }

  return context.json({
    sessionId: session.id,
    escola: session.escola,
    createdAt: new Date(session.createdAt).toISOString(),
    expiresInMs: env.sessionIdleMs,
  });
});

cadernetas.delete('/sessoes/:id', async (context) => {
  const closed = await closeSession(context.req.param('id'));

  if (!closed) {
    return context.json({ error: 'Sessão não encontrada ou expirada.' }, 404);
  }

  return context.body(null, 204);
});

/** Um envio: o material que o professor mandou, do jeito que ele mandou. */
cadernetas.post('/sessoes/:id/envios', async (context) => {
  const session = touchSession(context.req.param('id'));

  if (!session) {
    return context.json({ error: 'Sessão não encontrada ou expirada.' }, 404);
  }

  let body: Record<string, string | File | (string | File)[]>;
  try {
    body = await context.req.parseBody({ all: true });
  } catch {
    return context.json({ error: 'Envio malformado.' }, 400);
  }

  const texto = typeof body.texto === 'string' ? body.texto : '';
  const uploads = [body.arquivos ?? []]
    .flat()
    .filter((entry): entry is File => entry instanceof File);

  const tooLarge = uploads.find((file) => file.size > env.maxUploadBytes);
  if (tooLarge) {
    const limitMb = Math.round(env.maxUploadBytes / (1024 * 1024));
    return context.json(
      { error: `O arquivo "${tooLarge.name}" passa do limite de ${limitMb} MB.` },
      413,
    );
  }

  if (!texto.trim() && uploads.length === 0) {
    return context.json({ error: 'Envie um texto ou pelo menos um arquivo.' }, 400);
  }

  const arquivos: ArquivoEnviado[] = await Promise.all(
    uploads.map(async (file) => ({
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      data: new Uint8Array(await file.arrayBuffer()),
    })),
  );

  try {
    const catalogo = await getCatalogo(session.id);

    if (!catalogo) {
      return context.json({ error: 'Sessão não encontrada ou expirada.' }, 404);
    }

    const plano = await interpretarEnvio({ texto, arquivos, catalogo });

    const resultado = await postAulaContent(session.page, {
      etapa: plano.etapa,
      turma: plano.turma,
      mes: plano.mes,
      aulas: plano.aulas,
    });

    return context.json({ plano, resultado });
  } catch (error) {
    if (error instanceof OpenRouterNotConfiguredError) {
      return context.json({ error: error.message }, 503);
    }

    if (error instanceof ParteNaoSuportadaError || error instanceof EnvioInvalidoError) {
      return context.json({ error: error.message }, 422);
    }

    if (error instanceof MissingAulaRowsError) {
      return context.json(
        {
          error:
            'O portal não tem as aulas que o material descreve: ' +
            `${error.entries.join(', ')}. Confira a turma e o mês detectados.`,
        },
        422,
      );
    }

    if (error instanceof OpenRouterError) {
      return context.json({ error: `O agente falhou: ${error.message}` }, 502);
    }

    console.error('Falha ao processar o envio:', error);
    return context.json(
      { error: 'Não foi possível gravar o conteúdo no portal. Tente novamente.' },
      502,
    );
  }
});
