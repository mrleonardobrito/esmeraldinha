import { Hono } from 'hono';
import { z } from 'zod';

import { LoginError, MissingAulaRowsError } from './scrape/errors';
import {
  closeSession,
  getCatalogo,
  openSession,
  retomarSessao,
} from './portal-sessions';
import { postAulaContent, prepararAulaParaPreenchimento } from './scrape/portal';
import { naSessaoHeaded } from './sessoes-headed';
import {
  EnvioInvalidoError,
  OpenRouterError,
  OpenRouterNotConfiguredError,
  ParteNaoSuportadaError,
} from './ai/errors';
import { interpretarEnvio, type ArquivoEnviado } from './ai/interpretar-envio';
import {
  CadernetaNotFoundError,
  TurmaJaCadastradaError,
  createCaderneta,
  deleteCaderneta,
  getCaderneta,
  listAulasDaEtapa,
  listCadernetas,
  listEstudantes,
  marcarConteudoPreenchido,
  type Caderneta,
} from './cadernetas/store';
import { TurmaNaoEncontradaError } from './cadernetas/raspagem';
import { turmasDoCatalogo } from './turmas/busca';
import { sincronizarEmSegundoPlano } from './cadernetas/sincronizacao';
import { env } from './env';
import { createEncryptionPort } from './encryption';
import { getDb } from './professores/db';
import { getProfessorCredenciais } from './professores/store';

const abrirSessaoSchema = z.object({
  professorId: z.string().trim().min(1),
});

/**
 * O cadastro aceita uma turma ou várias: o auxiliar costuma cadastrar todas as
 * turmas do professor de uma vez. `turma` continua valendo para quem já
 * chamava assim.
 */
const cadastrarCadernetaSchema = z
  .object({
    sessionId: z.string().trim().min(1),
    professorId: z.string().trim().min(1),
    turma: z.string().trim().min(1).optional(),
    turmas: z.array(z.string().trim().min(1)).nonempty().optional(),
  })
  .refine((body) => body.turma !== undefined || body.turmas !== undefined, {
    message: 'Informe a turma da caderneta.',
  });

const sincronizarSchema = z.object({
  sessionId: z.string().trim().min(1),
});

const simNaoSchema = z.enum(['Sim', 'Não']);

/**
 * O preenchimento assistido não passa pela sessão headless: ele precisa de uma
 * janela que o auxiliar de ensino veja. Etapa, mês e ordem vêm da tela porque
 * é de lá que veio a aula clicada; o conteúdo também, porque o ponto é lançar
 * o que ele acabou de editar, não o que está no banco.
 */
const preenchimentoAssistidoSchema = z.object({
  etapa: z.string().trim().min(1),
  mes: z.string().trim().min(1),
  data: z.string().trim().min(1),
  ordem: z.number().int().nonnegative().nullish(),
  codigoCR: z.string().optional(),
  desenvolvimento: z.string().optional(),
  ferramentas: z.string().optional(),
  isRecuperacao: simNaoSchema.optional(),
  isInteracao: simNaoSchema.optional(),
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
    const session = await openSession(credenciais, { professorId });

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

cadernetas.get('/sessoes/:id', async (context) => {
  const session = await retomarSessao(context.req.param('id')).catch(() => undefined);

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
  let session;
  try {
    session = await retomarSessao(context.req.param('id'));
  } catch (error) {
    if (error instanceof LoginError) {
      return context.json({ error: error.message }, 401);
    }
    throw error;
  }

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
  // Opcional: quando o envio sai de dentro de uma caderneta, o progresso dela
  // é atualizado sem esperar uma nova raspagem.
  const cadernetaId = typeof body.cadernetaId === 'string' ? body.cadernetaId : '';
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

    if (cadernetaId && resultado.succeeded.length > 0) {
      const gravadas = plano.aulas.filter((aula) =>
        resultado.succeeded.includes(
          aula.ordem === undefined ? aula.data : `${aula.data} #${aula.ordem}`,
        ),
      );

      try {
        marcarConteudoPreenchido(
          getDb(),
          cadernetaId,
          gravadas.map((aula) => ({
            etapa: plano.etapa,
            data: aula.data,
            ordem: aula.ordem ?? null,
          })),
        );
      } catch (error) {
        // O conteúdo já está no portal, que é o que importa. Um progresso
        // desatualizado se resolve numa sincronização.
        console.error('Falha ao atualizar o progresso da caderneta:', error);
      }
    }

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


/**
 * Passa a guardar a caderneta de cada turma pedida, e dispara um job de
 * raspagem para cada uma.
 */
cadernetas.post('/', async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = cadastrarCadernetaSchema.safeParse(body);

  if (!parsed.success) {
    return context.json({ error: 'Informe a sessão, o professor e a turma da caderneta.' }, 400);
  }

  const { sessionId, professorId, turma, turmas } = parsed.data;
  // Sem duplicatas: pedir a mesma turma duas vezes é a segunda falhar à toa.
  const pedidas = [...new Set(turmas ?? (turma ? [turma] : []))];

  let session;
  try {
    session = await retomarSessao(sessionId);
  } catch (error) {
    if (error instanceof LoginError) {
      return context.json({ error: error.message }, 401);
    }
    throw error;
  }

  if (!session) {
    return context.json({ error: 'Sessão não encontrada ou expirada.' }, 404);
  }

  const professor = getDb()
    .prepare('SELECT id FROM professores WHERE id = ?')
    .get(professorId);

  if (!professor) {
    return context.json({ error: 'Professor não encontrado.' }, 404);
  }

  let catalogo;
  try {
    catalogo = await getCatalogo(sessionId);
  } catch (error) {
    console.error('Falha ao ler o catálogo do portal:', error);
    return context.json(
      { error: 'Não foi possível ler as turmas no portal. Tente novamente.' },
      502,
    );
  }

  if (!catalogo) {
    return context.json({ error: 'Sessão não encontrada ou expirada.' }, 404);
  }

  // As turmas são conferidas agora, com o catálogo em mãos: cadastrar uma
  // turma que não é do professor é erro do pedido, não da raspagem.
  const disponiveis = turmasDoCatalogo(catalogo);

  const cadastradas: Caderneta[] = [];
  const recusadas: { turma: string; motivo: string }[] = [];
  /** 409 é a resposta de quem pediu uma turma que já tem caderneta. */
  let jaCadastrada = false;

  // Uma turma por vez, cada uma com seu destino: uma que já tenha caderneta
  // não pode custar o cadastro das outras que o auxiliar escolheu junto.
  for (const turma of pedidas) {
    if (!disponiveis.includes(turma)) {
      recusadas.push({
        turma,
        motivo: new TurmaNaoEncontradaError(turma, disponiveis).message,
      });
      continue;
    }

    try {
      const caderneta = createCaderneta(getDb(), { professorId, turma });

      // Cada caderneta ganha seu job de raspagem — a fila da sessão é que os
      // faz esperar a vez na página do portal. A tela não espera por eles.
      sincronizarEmSegundoPlano({
        cadernetaId: caderneta.id,
        sessionId,
        page: session.page,
        catalogo,
      });

      cadastradas.push(caderneta);
    } catch (error) {
      if (error instanceof TurmaJaCadastradaError) {
        recusadas.push({ turma, motivo: error.message });
        jaCadastrada = true;
        continue;
      }

      console.error(`Falha ao cadastrar a caderneta de ${turma}:`, error);
      recusadas.push({
        turma,
        motivo: 'Não foi possível cadastrar esta turma. Tente novamente.',
      });
    }
  }

  // Quem manda `turma` continua tendo o pedido de uma turma só: a caderneta
  // quando dá certo, o erro dela quando não dá.
  if (turmas === undefined) {
    if (cadastradas.length === 0) {
      return context.json({ error: recusadas[0].motivo }, jaCadastrada ? 409 : 422);
    }

    return context.json(cadastradas[0], 201);
  }

  // Nenhuma das escolhidas entrou: não há cadastro nenhum para mostrar, e o
  // motivo da primeira explica o pedido.
  if (cadastradas.length === 0) {
    return context.json(
      { error: recusadas[0].motivo, recusadas },
      jaCadastrada ? 409 : 422,
    );
  }

  return context.json({ cadernetas: cadastradas, recusadas }, 201);
});

/** As turmas que o professor da sessão tem, para escolher no cadastro. */
cadernetas.get('/turmas', async (context) => {
  const sessionId = context.req.query('sessionId')?.trim();

  if (!sessionId) {
    return context.json({ error: 'Informe a sessão do portal.' }, 400);
  }

  try {
    const catalogo = await getCatalogo(sessionId);

    if (!catalogo) {
      return context.json({ error: 'Sessão não encontrada ou expirada.' }, 404);
    }

    return context.json({ turmas: turmasDoCatalogo(catalogo) });
  } catch (error) {
    console.error('Falha ao ler as turmas do professor:', error);
    return context.json({ error: 'Não foi possível ler as turmas no portal.' }, 502);
  }
});

/** A grade: as cadernetas do professor, com o progresso de cada etapa. */
cadernetas.get('/', (context) => {
  const professorId = context.req.query('professorId')?.trim();

  if (!professorId) {
    return context.json({ error: 'Informe o professor cujas cadernetas listar.' }, 400);
  }

  return context.json(listCadernetas(getDb(), professorId));
});

cadernetas.get('/:id', (context) => {
  try {
    return context.json(getCaderneta(getDb(), context.req.param('id')));
  } catch (error) {
    if (error instanceof CadernetaNotFoundError) {
      return context.json({ error: error.message }, 404);
    }
    throw error;
  }
});

/** As aulas datadas de uma etapa, que é o que a tela de lançar conteúdo lista. */
cadernetas.get('/:id/etapas/:etapa/aulas', (context) => {
  const id = context.req.param('id');
  const etapa = decodeURIComponent(context.req.param('etapa'));

  try {
    getCaderneta(getDb(), id);
  } catch (error) {
    if (error instanceof CadernetaNotFoundError) {
      return context.json({ error: error.message }, 404);
    }
    throw error;
  }

  return context.json({ etapa, aulas: listAulasDaEtapa(getDb(), id, etapa) });
});

/** Os estudantes da turma, que é o que a aba de turmas mostra. */
cadernetas.get('/:id/estudantes', (context) => {
  const id = context.req.param('id');

  try {
    getCaderneta(getDb(), id);
  } catch (error) {
    if (error instanceof CadernetaNotFoundError) {
      return context.json({ error: error.message }, 404);
    }
    throw error;
  }

  return context.json({ estudantes: listEstudantes(getDb(), id) });
});

/** Relê a turma no portal: a válvula para quando alguém preenche por fora. */
cadernetas.post('/:id/sincronizacoes', async (context) => {
  const id = context.req.param('id');
  const body = await context.req.json().catch(() => null);
  const parsed = sincronizarSchema.safeParse(body);

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
    const caderneta = getCaderneta(getDb(), id);
    const catalogo = await getCatalogo(parsed.data.sessionId);

    if (!catalogo) {
      return context.json({ error: 'Sessão não encontrada ou expirada.' }, 404);
    }

    sincronizarEmSegundoPlano({
      cadernetaId: caderneta.id,
      sessionId: parsed.data.sessionId,
      page: session.page,
      catalogo,
    });

    return context.json({ ...caderneta, syncStatus: 'sincronizando' as const }, 202);
  } catch (error) {
    if (error instanceof CadernetaNotFoundError) {
      return context.json({ error: error.message }, 404);
    }

    if (error instanceof TurmaNaoEncontradaError) {
      return context.json({ error: error.message }, 422);
    }

    console.error('Falha ao sincronizar a caderneta:', error);
    return context.json({ error: 'Não foi possível reler as aulas no portal.' }, 502);
  }
});

/**
 * Abre a aula numa janela visível do portal, com o conteúdo editado já escrito
 * nos campos, e para aí. Salvar é decisão do auxiliar de ensino: a automação
 * só o poupa dos quatro filtros e da procura pela linha.
 */
cadernetas.post('/:id/aulas/preenchimentos-assistidos', async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = preenchimentoAssistidoSchema.safeParse(body);

  if (!parsed.success) {
    return context.json({ error: 'Informe a etapa, o mês e a data da aula.' }, 400);
  }

  const { etapa, mes, data, ordem, ...conteudo } = parsed.data;

  let caderneta: Caderneta;
  try {
    caderneta = getCaderneta(getDb(), context.req.param('id'));
  } catch (error) {
    if (error instanceof CadernetaNotFoundError) {
      return context.json({ error: error.message }, 404);
    }
    throw error;
  }

  const credenciais = await getProfessorCredenciais(
    getDb(),
    createEncryptionPort(),
    caderneta.professorId,
  );

  if (!credenciais) {
    return context.json({ error: 'Professor não encontrado.' }, 404);
  }

  try {
    await naSessaoHeaded(caderneta.professorId, credenciais, (page) =>
      prepararAulaParaPreenchimento(page, {
        etapa,
        mes,
        turma: caderneta.turma,
        data,
        ...(ordem === null || ordem === undefined ? {} : { ordem }),
        conteudo,
      }),
    );

    return context.json({ etapa, mes, data, ordem: ordem ?? null });
  } catch (error) {
    if (error instanceof LoginError) {
      return context.json({ error: error.message }, 401);
    }

    if (error instanceof MissingAulaRowsError) {
      return context.json(
        {
          error:
            `O portal não tem a aula de ${data} nesta turma. ` +
            'Sincronize a caderneta e tente de novo.',
        },
        422,
      );
    }

    console.error('Falha ao preparar o preenchimento da aula:', error);
    return context.json(
      { error: 'Não foi possível abrir a aula no portal. Tente novamente.' },
      502,
    );
  }
});

cadernetas.delete('/:id', (context) => {
  try {
    deleteCaderneta(getDb(), context.req.param('id'));
    return context.body(null, 204);
  } catch (error) {
    if (error instanceof CadernetaNotFoundError) {
      return context.json({ error: error.message }, 404);
    }

    console.error('Falha ao excluir a caderneta:', error);
    return context.json({ error: 'Não foi possível excluir a caderneta.' }, 500);
  }
});
