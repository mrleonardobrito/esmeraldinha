import { Hono } from 'hono';
import { z } from 'zod';

import { indiceDaEtapa, preenchimentoDaFichaSchema, type Excecao } from '../../shared/ficha-de-desempenho';
import { ArquivoIlegivelError, EnvioInvalidoError, OpenRouterError, OpenRouterNotConfiguredError } from '../ai/errors';
import type { ArquivoEnviado } from '../ai/interpretar-envio';
import { interpretarObservacoes } from '../ai/interpretar-observacoes';
import type { ContaEnv } from '../conta/autenticacao';
import { createEncryptionPort } from '../encryption';
import { env } from '../env';
import {
  acompanharPreenchimento,
  estadoDoPreenchimento,
  iniciarPreenchimento,
  PreenchimentoEmAndamentoError,
} from '../fichas/preenchimento-assistido';
import { getEstruturaDaFicha, salvarEstruturaDaFicha } from '../fichas/store';
import { naSessaoHeaded } from '../sessoes-headed';
import { closeSession, openSession } from '../portal-sessions';
import { getDb } from '../professores/db';
import { getProfessorCredenciais } from '../professores/store';
import { FichaNaoSuportadaError, LoginError } from '../scrape/errors';
import { lerEstruturaDaFicha } from '../scrape/ficha-de-desempenho';
import { periodoLetivoDaTurma } from '../turmas/store';
import { CadernetaNotFoundError, getCaderneta, listEstudantes, type Caderneta } from './store';

/** Routes of the ficha de desempenho of one caderneta's turma. */
export const fichaDeDesempenho = new Hono<ContaEnv>();

function cadernetaDaRota(id: string, turma: string | undefined): Caderneta | null {
  try {
    return getCaderneta(getDb(), id, turma);
  } catch (error) {
    if (error instanceof CadernetaNotFoundError) return null;
    throw error;
  }
}

fichaDeDesempenho.get('/:id/ficha-de-desempenho/estrutura', (context) => {
  const caderneta = cadernetaDaRota(context.req.param('id'), context.req.query('turma'));
  if (!caderneta) return context.json({ error: 'Caderneta não encontrada.' }, 404);
  return context.json({ estrutura: getEstruturaDaFicha(getDb(), caderneta.professorId, caderneta.turma) });
});

/**
 * Reads the áreas and habilidades of the turma's ficha in a headless sessão do
 * portal: opens the first estudante's ficha and closes it without saving.
 */
fichaDeDesempenho.post('/:id/ficha-de-desempenho/estrutura/leituras', async (context) => {
  const caderneta = cadernetaDaRota(context.req.param('id'), context.req.query('turma'));
  if (!caderneta) return context.json({ error: 'Caderneta não encontrada.' }, 404);

  const credenciais = await getProfessorCredenciais(getDb(), createEncryptionPort(), caderneta.professorId);
  if (!credenciais) return context.json({ error: 'Professor não encontrado.' }, 404);

  let sessionId: string | undefined;
  try {
    const session = await openSession(credenciais, { professorId: caderneta.professorId });
    sessionId = session.id;
    const lida = await lerEstruturaDaFicha(session.page, {
      periodoLetivo: periodoLetivoDaTurma(getDb(), caderneta.professorId, caderneta.turma),
      turma: caderneta.turma,
    });
    return context.json({ estrutura: salvarEstruturaDaFicha(getDb(), caderneta.professorId, caderneta.turma, lida) });
  } catch (error) {
    if (error instanceof FichaNaoSuportadaError || error instanceof LoginError) {
      return context.json({ error: error.message }, 422);
    }
    console.error('Failed to read the ficha de desempenho:', error);
    return context.json({ error: 'Não foi possível ler a ficha de desempenho no portal. Tente novamente.' }, 502);
  } finally {
    if (sessionId) await closeSession(sessionId);
  }
});

const areasSchema = z.array(z.number().int().nonnegative()).min(1);

/** Reads a JSON field of the multipart body; undefined when absent or invalid. */
function campoJson(valor: unknown): unknown {
  if (typeof valor !== 'string' || !valor.trim()) return undefined;
  try {
    return JSON.parse(valor) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The agent's reading of the professor's observações for one etapa, checked
 * against the turma's estudantes. Touches neither the portal nor the database.
 */
fichaDeDesempenho.post('/:id/etapas/:etapa/ficha-de-desempenho/observacoes', async (context) => {
  const caderneta = cadernetaDaRota(context.req.param('id'), context.req.query('turma'));
  if (!caderneta) return context.json({ error: 'Caderneta não encontrada.' }, 404);
  const etapa = decodeURIComponent(context.req.param('etapa'));

  try {
    indiceDaEtapa(etapa);
  } catch {
    return context.json({ error: `A ficha de desempenho não tem a etapa "${etapa}".` }, 422);
  }

  const estrutura = getEstruturaDaFicha(getDb(), caderneta.professorId, caderneta.turma);
  if (!estrutura) {
    return context.json({ error: 'Leia a ficha de desempenho no portal antes de enviar as observações.' }, 422);
  }

  let body: Record<string, string | File | (string | File)[]>;
  try {
    body = await context.req.parseBody({ all: true });
  } catch {
    return context.json({ error: 'Envio malformado.' }, 400);
  }

  const areas = areasSchema.safeParse(campoJson(body.areas));
  if (!areas.success) return context.json({ error: 'Escolha ao menos uma área de conhecimento.' }, 400);
  const escolhidas = estrutura.areas.filter((area) => areas.data.includes(area.indice));
  if (escolhidas.length !== areas.data.length) {
    return context.json({ error: 'Uma das áreas escolhidas não existe nesta ficha. Releia a ficha no portal.' }, 422);
  }

  const uploads = [body.arquivos ?? []].flat().filter((entry): entry is File => entry instanceof File);
  const tooLarge = uploads.find((file) => file.size > env.maxUploadBytes);
  if (tooLarge) {
    const limitMb = Math.round(env.maxUploadBytes / (1024 * 1024));
    return context.json({ error: `O arquivo "${tooLarge.name}" passa do limite de ${limitMb} MB.` }, 413);
  }
  const arquivos: ArquivoEnviado[] = await Promise.all(uploads.map(async (file) => ({
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    data: new Uint8Array(await file.arrayBuffer()),
  })));

  const turma = listEstudantes(getDb(), caderneta.id, caderneta.turma);
  if (turma.length === 0) {
    return context.json({ error: 'A caderneta ainda não tem os estudantes lidos do portal. Sincronize e tente de novo.' }, 422);
  }

  try {
    const interpretadas = await interpretarObservacoes({
      turma: caderneta.turma,
      etapa,
      areas: escolhidas,
      estudantes: turma.map(({ matricula, nome }) => ({ matricula, nome })),
      texto: typeof body.texto === 'string' ? body.texto : '',
      arquivos,
    });
    return context.json({
      ...interpretadas,
      turma: turma.map(({ matricula, nome, situacao }) => ({ matricula, nome, situacao })),
    });
  } catch (error) {
    if (error instanceof OpenRouterNotConfiguredError) return context.json({ error: error.message }, 503);
    if (error instanceof EnvioInvalidoError || error instanceof ArquivoIlegivelError) {
      return context.json({ error: error.message }, 422);
    }
    if (error instanceof OpenRouterError) return context.json({ error: `O agente falhou: ${error.message}` }, 502);
    console.error('Failed to interpret observações:', error);
    return context.json({ error: 'Não foi possível ler as observações. Tente novamente.' }, 502);
  }
});

const chaveDaExecucao = (caderneta: Caderneta) => `${caderneta.id}|${caderneta.turma}`;

/**
 * Starts the preenchimento assistido of one etapa in the professor's headed
 * window. Answers right away: the run follows the auxiliar de ensino's
 * Salvar e próximo for as long as they keep going, and its progress is read
 * from the status route.
 */
fichaDeDesempenho.post('/:id/etapas/:etapa/ficha-de-desempenho/preenchimentos-assistidos', async (context) => {
  const caderneta = cadernetaDaRota(context.req.param('id'), context.req.query('turma'));
  if (!caderneta) return context.json({ error: 'Caderneta não encontrada.' }, 404);
  const nomeDaEtapa = decodeURIComponent(context.req.param('etapa'));

  let etapa;
  try {
    etapa = indiceDaEtapa(nomeDaEtapa);
  } catch {
    return context.json({ error: `A ficha de desempenho não tem a etapa "${nomeDaEtapa}".` }, 422);
  }

  const parsed = preenchimentoDaFichaSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: 'Escolha as áreas de conhecimento a preencher.' }, 400);
  const { areas, excecoes } = parsed.data;

  const db = getDb();
  const estrutura = getEstruturaDaFicha(db, caderneta.professorId, caderneta.turma);
  if (!estrutura) return context.json({ error: 'Leia a ficha de desempenho no portal antes de preencher.' }, 422);
  if (areas.some((area) => !estrutura.areas.some((candidata) => candidata.indice === area))) {
    return context.json({ error: 'Uma das áreas escolhidas não existe nesta ficha. Releia a ficha no portal.' }, 422);
  }

  const estudantes = listEstudantes(db, caderneta.id, caderneta.turma);
  const desconhecida = excecoes.find((excecao) => !estudantes.some((e) => e.matricula === excecao.matricula));
  if (desconhecida) {
    return context.json({ error: `A matrícula ${desconhecida.matricula} não é de um estudante desta turma.` }, 422);
  }

  const credenciais = await getProfessorCredenciais(db, createEncryptionPort(), caderneta.professorId);
  if (!credenciais) return context.json({ error: 'Professor não encontrado.' }, 404);

  const porMatricula = new Map<string, Excecao[]>();
  for (const { matricula, ...excecao } of excecoes) {
    porMatricula.set(matricula, [...(porMatricula.get(matricula) ?? []), excecao]);
  }
  const plano = {
    periodoLetivo: periodoLetivoDaTurma(db, caderneta.professorId, caderneta.turma),
    turma: caderneta.turma,
    etapa,
    nomeDaEtapa,
    areas,
    estudantes: estudantes.map(({ matricula, nome, situacao }) => ({ matricula, nome, situacao })),
    excecoes: porMatricula,
    estrutura: estrutura.areas,
  };

  try {
    const inicial = iniciarPreenchimento(
      chaveDaExecucao(caderneta),
      { status: 'abrindo', etapa: nomeDaEtapa, total: 0, atual: null, preenchidos: [], pulados: [], erro: null },
      (onEstado) => naSessaoHeaded(caderneta.professorId, credenciais, (page) =>
        acompanharPreenchimento(page, plano, onEstado)),
    );
    return context.json({ estado: inicial }, 202);
  } catch (error) {
    if (error instanceof PreenchimentoEmAndamentoError) return context.json({ error: error.message }, 409);
    throw error;
  }
});

fichaDeDesempenho.get('/:id/ficha-de-desempenho/preenchimentos-assistidos/atual', (context) => {
  const caderneta = cadernetaDaRota(context.req.param('id'), context.req.query('turma'));
  if (!caderneta) return context.json({ error: 'Caderneta não encontrada.' }, 404);
  return context.json({ estado: estadoDoPreenchimento(chaveDaExecucao(caderneta)) });
});
