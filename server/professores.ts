import { Hono } from 'hono';
import { z } from 'zod';
import type { ContaEnv } from './conta/autenticacao';
import { AuthFailure } from './conta/supabase';
import {
  changeProfessorAcesso,
  deleteProfessorWithAuth,
  reconcileProfessor,
  updateProfessorWithAuth,
  withProfessorLock,
} from './professores/acesso';

import { professorSchema, professorUpdateSchema } from '../shared/professor';
import { createEncryptionPort } from './encryption';
import { getDb } from './professores/db';
import {
  DuplicateLoginError,
  ProfessorNotFoundError,
  createProfessor,
  getProfessor,
  listProfessores,
} from './professores/store';

export const professores = new Hono<ContaEnv>();

professores.get('/', async (context) => {
  const list = await listProfessores(getDb());
  return context.json(list);
});

professores.post('/', async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = professorSchema.safeParse(body);

  if (!parsed.success) {
    return context.json(
      {
        error:
          parsed.error.issues[0]?.message ?? 'Dados do professor inválidos.',
      },
      400,
    );
  }

  try {
    const professor = await createProfessor(
      getDb(),
      createEncryptionPort(),
      parsed.data,
    );
    return context.json(professor, 201);
  } catch (error) {
    if (error instanceof AuthFailure) throw error;
    if (error instanceof DuplicateLoginError) {
      return context.json({ error: error.message }, 409);
    }

    console.error('Falha ao cadastrar professor:', error);
    return context.json(
      { error: 'Não foi possível cadastrar o professor.' },
      500,
    );
  }
});

professores.put('/:id', async (context) => {
  const id = context.req.param('id');
  const body = await context.req.json().catch(() => null);
  const parsed = professorUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return context.json(
      {
        error:
          parsed.error.issues[0]?.message ?? 'Dados do professor inválidos.',
      },
      400,
    );
  }

  try {
    const professor = await updateProfessorWithAuth(
      id,
      parsed.data,
      context.get('auth'),
      context.get('sessao').provider,
    );
    return context.json(professor);
  } catch (error) {
    if (error instanceof AuthFailure) throw error;
    if (error instanceof DuplicateLoginError) {
      return context.json({ error: error.message }, 409);
    }

    if (error instanceof ProfessorNotFoundError) {
      return context.json({ error: error.message }, 404);
    }

    console.error('Falha ao atualizar professor:', error);
    return context.json(
      { error: 'Não foi possível atualizar o professor.' },
      500,
    );
  }
});

professores.put('/:id/acesso', async (context) => {
  const body = (await context.req.json().catch(() => null)) as {
    liberado?: unknown;
  } | null;
  if (typeof body?.liberado !== 'boolean') {
    return context.json(
      { error: 'Informe se o acesso deve ser liberado.' },
      400,
    );
  }

  try {
    return context.json(
      await changeProfessorAcesso(
        context.req.param('id'),
        body.liberado,
        context.get('auth'),
        context.get('sessao').provider,
      ),
    );
  } catch (error) {
    if (error instanceof AuthFailure) throw error;
    if (error instanceof ProfessorNotFoundError) {
      return context.json({ error: error.message }, 404);
    }
    throw error;
  }
});

professores.delete('/:id', async (context) => {
  const id = context.req.param('id');

  try {
    await deleteProfessorWithAuth(
      id,
      context.get('auth'),
      context.get('sessao').provider,
    );
    return context.body(null, 204);
  } catch (error) {
    if (error instanceof AuthFailure) throw error;
    if (error instanceof ProfessorNotFoundError) {
      return context.json({ error: error.message }, 404);
    }

    console.error('Falha ao excluir professor:', error);
    return context.json(
      { error: 'Não foi possível excluir o professor.' },
      500,
    );
  }
});

professores.post('/:id/auth/reconciliacoes', async (context) => {
  const id = context.req.param('id');
  if (!(await getProfessor(getDb(), id)))
    return context.json({ error: 'Professor não encontrado.' }, 404);
  return context.json(
    await withProfessorLock(
      id,
      async () =>
        await reconcileProfessor(
          id,
          context.get('auth'),
          context.get('sessao').provider,
        ),
    ),
  );
});

professores.post('/:id/auth/codigos', async (context) => {
  const professor = await getProfessor(getDb(), context.req.param('id'));
  if (!professor?.email || professor.authStatus !== 'verifying')
    return context.json(
      { error: 'Não há uma confirmação de e-mail pendente.' },
      409,
    );
  await context.get('auth').sendCode(professor.email);
  return context.json({ enviado: true });
});

professores.post('/:id/auth/verificacoes', async (context) => {
  const parsed = z
    .object({ codigo: z.string().regex(/^\d{6,10}$/) })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success)
    return context.json(
      { error: 'Informe o código recebido por e-mail.' },
      400,
    );
  const id = context.req.param('id');
  return withProfessorLock(id, async () => {
    const professor = await getProfessor(getDb(), id);
    const binding = (await getDb()
      .prepare('SELECT supabase_auth_id FROM professores WHERE id = ?')
      .get(id)) as { supabase_auth_id: string } | undefined;
    if (!professor?.email || professor.authStatus !== 'verifying' || !binding)
      return context.json({ error: 'Não há uma confirmação pendente.' }, 409);
    let proof;
    try {
      proof = await context
        .get('auth')
        .verifyCode(parsed.data.codigo, professor.email);
    } catch (error) {
      if (error instanceof AuthFailure && error.status === 401)
        throw new AuthFailure('Código inválido ou expirado.', 422);
      throw error;
    }
    try {
      if (
        proof.userId !== binding.supabase_auth_id ||
        proof.email !== professor.email ||
        !proof.emailVerified
      )
        throw new AuthFailure('O código não corresponde ao professor.', 403);
    } finally {
      await proof.signOut('local').catch(() => {});
    }
    return context.json(
      await reconcileProfessor(
        id,
        context.get('auth'),
        context.get('sessao').provider,
      ),
    );
  });
});
