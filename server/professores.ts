import { Hono } from 'hono';
import { z } from 'zod';
import type { ContaEnv } from './conta/autenticacao';

import { professorSchema, professorUpdateSchema } from '../shared/professor';
import type { IdentityService } from './modules/identity';
import { createEncryptionPort } from './encryption';
import { getDb } from './professores/db';
import {
  DuplicateLoginError,
  ProfessorNotFoundError,
  createProfessor,
  deleteProfessor,
  listProfessores,
  updateProfessor,
  setProfessorAcesso,
} from './professores/store';


export function createProfessoresRoutes(identity: IdentityService) {
  const professores = new Hono<ContaEnv>();

  professores.get('/', (context) => {
    const list = listProfessores(getDb());
    return context.json(list);
  });

  professores.post('/', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = professorSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(
        { error: parsed.error.issues[0]?.message ?? 'Dados do professor inválidos.' },
        400,
      );
    }

    try {
      const professor = await createProfessor(getDb(), createEncryptionPort(), parsed.data);
      return context.json(professor, 201);
    } catch (error) {
      if (error instanceof DuplicateLoginError) {
        return context.json({ error: error.message }, 409);
      }

      console.error('Falha ao cadastrar professor:', error);
      return context.json({ error: 'Não foi possível cadastrar o professor.' }, 500);
    }
  });

  professores.put('/:id', async (context) => {
    const id = context.req.param('id');
    const body = await context.req.json().catch(() => null);
    const parsed = professorUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(
        { error: parsed.error.issues[0]?.message ?? 'Dados do professor inválidos.' },
        400,
      );
    }

    try {
      const professor = await updateProfessor(getDb(), createEncryptionPort(), id, parsed.data);
      return context.json(professor);
    } catch (error) {
      if (error instanceof DuplicateLoginError) {
        return context.json({ error: error.message }, 409);
      }

      if (error instanceof ProfessorNotFoundError) {
        return context.json({ error: error.message }, 404);
      }

      console.error('Falha ao atualizar professor:', error);
      return context.json({ error: 'Não foi possível atualizar o professor.' }, 500);
    }
  });

  professores.post('/:id/convite', async (context) => {
    const parsed = z.object({ email: z.email().max(254) }).safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: 'Informe um e-mail válido.' }, 400);
    const result = await identity.issueEnrollment(context.get('user'), context.req.param('id'), parsed.data.email);
    if (result.status === 'access_denied') return context.json({ error: 'Acesso negado.' }, 403);
    if (result.status === 'not_found') return context.json({ error: 'Professor não encontrado.' }, 404);
    if (result.status !== 'issued') return context.json({ error: 'E-mail já utilizado.' }, 409);
    context.header('Cache-Control', 'no-store');
    return context.json({ token: result.token, expiresAt: result.expiresAt }, 201);
  });

  professores.put('/:id/acesso', async (context) => {
    const body = await context.req.json().catch(() => null) as { liberado?: unknown } | null;
    if (typeof body?.liberado !== 'boolean') {
      return context.json({ error: 'Informe se o acesso deve ser liberado.' }, 400);
    }

    try {
      if (body.liberado && !getDb().prepare('SELECT 1 FROM professor_accounts WHERE professor_id = ? AND password_hash IS NOT NULL').get(context.req.param('id'))) {
        return context.json({ error: 'Gere um link de primeiro acesso para o professor.' }, 409);
      }
      const professor = setProfessorAcesso(getDb(), context.req.param('id'), body.liberado);
      if (!body.liberado) await identity.closeProfessorSessions(professor.id);
      return context.json(professor);
    } catch (error) {
      if (error instanceof ProfessorNotFoundError) {
        return context.json({ error: error.message }, 404);
      }
      throw error;
    }
  });

  professores.delete('/:id', async (context) => {
    const id = context.req.param('id');

    try {
      await identity.closeProfessorSessions(id);
      deleteProfessor(getDb(), id);
      return context.body(null, 204);
    } catch (error) {
      if (error instanceof ProfessorNotFoundError) {
        return context.json({ error: error.message }, 404);
      }

      console.error('Falha ao excluir professor:', error);
      return context.json({ error: 'Não foi possível excluir o professor.' }, 500);
    }
  });

  return professores;
}
