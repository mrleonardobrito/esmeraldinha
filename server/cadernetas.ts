import { Hono } from 'hono';
import { z } from 'zod';

import { LoginError } from '../scrape/errors';
import { closeSession, openSession, touchSession } from './portal-sessions';
import { env } from './env';

const credentialsSchema = z.object({
  login: z.string().trim().min(1),
  senha: z.string().min(1),
  escola: z.string().trim().min(1),
});

export const cadernetas = new Hono();

/** Abre uma sessão headless no portal e faz login com as credenciais do professor. */
cadernetas.post('/sessoes', async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);

  if (!parsed.success) {
    return context.json({ error: 'Credenciais do professor incompletas.' }, 400);
  }

  const { login, senha, escola } = parsed.data;

  try {
    const session = await openSession({
      username: login,
      password: senha,
      school: escola,
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
