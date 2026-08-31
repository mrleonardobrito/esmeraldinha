import { Hono } from 'hono';

import { professorSchema, professorUpdateSchema } from '../shared/professor';
import { createEncryptionPort } from './encryption';
import { getDb } from './professores/db';
import {
  DuplicateLoginError,
  ProfessorNotFoundError,
  createProfessor,
  deleteProfessor,
  listProfessores,
  updateProfessor,
} from './professores/store';

export const professores = new Hono();

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

professores.delete('/:id', (context) => {
  const id = context.req.param('id');

  try {
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
