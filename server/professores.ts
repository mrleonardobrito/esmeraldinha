import { Hono } from 'hono';

import { professorSchema } from '../shared/professor';
import { createEncryptionPort } from './encryption';
import { getDb } from './professores/db';
import { DuplicateLoginError, createProfessor, listProfessores } from './professores/store';

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
