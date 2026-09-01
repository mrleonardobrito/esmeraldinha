import { Hono } from 'hono';
import { z } from 'zod';

import { LoginError } from './scrape/errors';
import { closeSession, openSession, touchSession } from './portal-sessions';
import { env } from './env';
import { createEncryptionPort } from './encryption';
import { getDb } from './professores/db';
import { getProfessorCredenciais } from './professores/store';

const abrirSessaoSchema = z.object({
  professorId: z.string().trim().min(1),
});

export const cadernetas = new Hono();

cadernetas.post('/sessoes', async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = abrirSessaoSchema.safeParse(body);

  if (!parsed.success) {
    return context.json({ error: 'Informe o professor cuja sessão deve ser aberta.' }, 400);
  }

  const { professorId } = parsed.data;

  const credenciais = await getProfessorCredenciais(getDb(), createEncryptionPort(), professorId);

  if (!credenciais) {
    return context.json({ error: 'Professor não encontrado.' }, 404);
  }

  try {
    const session = await openSession(credenciais);

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
