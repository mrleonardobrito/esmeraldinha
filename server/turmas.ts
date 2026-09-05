import { Hono } from 'hono';
import { z } from 'zod';

import { createEncryptionPort } from './encryption';
import { getDb } from './professores/db';
import { getProfessorCredenciais } from './professores/store';
import { closeSession, getCatalogo, openSession, retomarSessao } from './portal-sessions';
import { LoginError } from './scrape/errors';
import { buscarEstudantes, turmasDoCatalogo } from './turmas/busca';
import {
  TurmaNotFoundError,
  getTurma,
  listEstudantes,
  listTurmas,
  replaceEstudantes,
  replaceTurmas,
} from './turmas/store';

const credenciaisSchema = z.object({
  login: z.string().trim().min(1),
  senha: z.string().min(1),
  escola: z.string().trim().min(1),
});

const buscarTurmasSchema = z.object({
  professorId: z.string().trim().min(1),
});

const buscarEstudantesSchema = z.object({
  sessionId: z.string().trim().min(1),
});

export const turmas = new Hono();

/**
 * Passo 1 do cadastro do professor: as credenciais valem no portal?
 *
 * O professor ainda não existe no banco, então as credenciais vêm no corpo —
 * é a única rota em que elas trafegam assim. A sessão aberta para conferi-las
 * é fechada em seguida: ela serviu para responder a pergunta, e guardá-la
 * seria segurar um navegador aberto por um cadastro que pode nem terminar.
 */
turmas.post('/validacoes', async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = credenciaisSchema.safeParse(body);

  if (!parsed.success) {
    return context.json({ error: 'Informe o login, a senha e a escola do professor.' }, 400);
  }

  try {
    const session = await openSession(parsed.data);
    await closeSession(session.id);

    return context.json({ valida: true, escola: session.escola });
  } catch (error) {
    if (error instanceof LoginError) {
      return context.json({ error: error.message }, 401);
    }

    console.error('Falha ao validar as credenciais no portal:', error);
    return context.json(
      { error: 'Não foi possível acessar o portal. Tente novamente em instantes.' },
      502,
    );
  }
});

/**
 * Passo 2 do cadastro: as turmas em que o professor trabalha, lidas do portal
 * e guardadas, com os estudantes de cada uma. O nome e o turno saem do próprio
 * nome que o portal escreve — nada disso é digitado.
 *
 * Serve tanto para um professor recém-cadastrado quanto para um que já existe:
 * rodar de novo relê tudo do portal, que é como um professor antigo ganha os
 * estudantes que o cadastro dele não tinha lido.
 *
 * Abre e fecha a própria sessão: o cadastro acabou de gravar o professor, e a
 * senha nunca precisa sair do servidor para isso.
 */
turmas.post('/buscas', async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = buscarTurmasSchema.safeParse(body);

  if (!parsed.success) {
    return context.json({ error: 'Informe o professor cujas turmas buscar.' }, 400);
  }

  const { professorId } = parsed.data;
  const credenciais = await getProfessorCredenciais(
    getDb(),
    createEncryptionPort(),
    professorId,
  );

  if (!credenciais) {
    return context.json({ error: 'Professor não encontrado.' }, 404);
  }

  let sessionId: string | undefined;

  try {
    const session = await openSession(credenciais);
    sessionId = session.id;

    const catalogo = await getCatalogo(session.id);

    if (!catalogo) {
      return context.json({ error: 'Sessão não encontrada ou expirada.' }, 404);
    }

    const encontradas = replaceTurmas(getDb(), professorId, turmasDoCatalogo(catalogo));

    // Os estudantes vêm na mesma sessão: ela já está aberta, e uma turma sem
    // eles não serve para as fichas nem para o boletim. A falha de uma turma
    // não derruba as outras — turma sem estudante ainda é turma conhecida.
    for (const turma of encontradas) {
      try {
        const estudantes = await buscarEstudantes(session.page, turma.nome);
        replaceEstudantes(getDb(), turma.id, estudantes);
      } catch (error) {
        console.error(`Falha ao ler os estudantes de ${turma.nome}:`, error);
      }
    }

    return context.json({ turmas: listTurmas(getDb(), professorId) });
  } catch (error) {
    if (error instanceof LoginError) {
      return context.json({ error: error.message }, 401);
    }

    console.error('Falha ao buscar as turmas do professor:', error);
    return context.json({ error: 'Não foi possível ler as turmas no portal.' }, 502);
  } finally {
    if (sessionId) await closeSession(sessionId);
  }
});

/** As turmas já conhecidas de um professor, sem ir ao portal. */
turmas.get('/', (context) => {
  const professorId = context.req.query('professorId')?.trim();

  if (!professorId) {
    return context.json({ error: 'Informe o professor cujas turmas listar.' }, 400);
  }

  return context.json({ turmas: listTurmas(getDb(), professorId) });
});

turmas.get('/:id/estudantes', (context) => {
  const id = context.req.param('id');

  try {
    getTurma(getDb(), id);
  } catch (error) {
    if (error instanceof TurmaNotFoundError) {
      return context.json({ error: error.message }, 404);
    }
    throw error;
  }

  return context.json({ estudantes: listEstudantes(getDb(), id) });
});

/** Passo 3 do cadastro: os estudantes de uma turma, lidos do portal. */
turmas.post('/:id/estudantes/buscas', async (context) => {
  const id = context.req.param('id');
  const body = await context.req.json().catch(() => null);
  const parsed = buscarEstudantesSchema.safeParse(body);

  if (!parsed.success) {
    return context.json({ error: 'Informe a sessão do portal.' }, 400);
  }

  let session;
  try {
    session = await retomarSessao(parsed.data.sessionId);
  } catch (error) {
    if (error instanceof LoginError) {
      return context.json({ error: error.message }, 401);
    }
    throw error;
  }

  if (!session) {
    return context.json({ error: 'Sessão não encontrada ou expirada.' }, 404);
  }

  try {
    const turma = getTurma(getDb(), id);
    const encontrados = await buscarEstudantes(session.page, turma.nome);

    return context.json({ estudantes: replaceEstudantes(getDb(), id, encontrados) });
  } catch (error) {
    if (error instanceof TurmaNotFoundError) {
      return context.json({ error: error.message }, 404);
    }

    console.error('Falha ao buscar os estudantes da turma:', error);
    return context.json({ error: 'Não foi possível ler os estudantes no portal.' }, 502);
  }
});
