import { Hono } from 'hono';
import { z } from 'zod';

import {
  ajustarPrevia,
  ETAPAS_DA_FICHA,
  etapasSchema,
  fichaInicial,
  normalizarLinha,
  previaEditadaSchema,
  chaveDaHabilidade,
  type AreaDeConhecimento,
  type FichaPlanejada,
  type IndiceDaEtapa,
} from '../../shared/ficha-de-desempenho';
import { ArquivoIlegivelError, EnvioInvalidoError, OpenRouterError, OpenRouterNotConfiguredError } from '../ai/errors';
import type { ArquivoEnviado } from '../ai/interpretar-envio';
import { interpretarObservacoes } from '../ai/interpretar-observacoes';
import type { ContaEnv } from '../conta/autenticacao';
import { env } from '../env';
import {
  acompanharPreenchimento,
  estadoDoPreenchimento,
  iniciarPreenchimento,
  PreenchimentoEmAndamentoError,
} from '../fichas/preenchimento-assistido';
import { apagarPrevia, getEstruturaDaFicha, getPrevia, salvarEstruturaDaFicha, salvarPrevia } from '../fichas/store';
import { naSessaoHeaded } from '../sessoes-headed';
import { closeSession, openSession } from '../portal-sessions';
import { getDb } from '../professores/db';
import { lerCredenciaisDoProfessor } from '../professores/credenciais';
import { FichaNaoSuportadaError, LoginError } from '../scrape/errors';
import { lerEstruturaDaFicha } from '../scrape/ficha-de-desempenho';
import { periodoLetivoDaTurma } from '../turmas/store';
import { CadernetaNotFoundError, getCaderneta, listEstudantes, type Caderneta } from './store';

/** Routes of the ficha de desempenho of one caderneta's turma. */
export const fichaDeDesempenho = new Hono<ContaEnv>();

async function cadernetaDaRota(id: string, turma: string | undefined): Promise<Caderneta | null> {
  try {
    return await getCaderneta(getDb(), id, turma);
  } catch (error) {
    if (error instanceof CadernetaNotFoundError) return null;
    throw error;
  }
}

fichaDeDesempenho.get('/:id/ficha-de-desempenho/estrutura', async (context) => {
  const caderneta = await cadernetaDaRota(context.req.param('id'), context.req.query('turma'));
  if (!caderneta) return context.json({ error: 'Caderneta não encontrada.' }, 404);
  return context.json({ estrutura: await getEstruturaDaFicha(getDb(), caderneta.professorId, caderneta.turma) });
});

/**
 * Reads the áreas and habilidades of the turma's ficha in a headless sessão do
 * portal: opens the first estudante's ficha and closes it without saving.
 */
fichaDeDesempenho.post('/:id/ficha-de-desempenho/estrutura/leituras', async (context) => {
  const caderneta = await cadernetaDaRota(context.req.param('id'), context.req.query('turma'));
  if (!caderneta) return context.json({ error: 'Caderneta não encontrada.' }, 404);

  const credenciais = await lerCredenciaisDoProfessor(caderneta.professorId);
  if (!credenciais) return context.json({ error: 'Professor não encontrado.' }, 404);

  let sessionId: string | undefined;
  try {
    const session = await openSession(credenciais, { professorId: caderneta.professorId });
    sessionId = session.id;
    const lida = await lerEstruturaDaFicha(session.page, {
      periodoLetivo: await periodoLetivoDaTurma(getDb(), caderneta.professorId, caderneta.turma),
      turma: caderneta.turma,
    });
    return context.json({ estrutura: await salvarEstruturaDaFicha(getDb(), caderneta.professorId, caderneta.turma, lida) });
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

/** "I a IV ETAPA", "II e IV ETAPA", "I ETAPA": how a set of etapas reads on screen. */
function rotuloDasEtapas(etapas: readonly IndiceDaEtapa[]): string {
  const ordenadas = [...etapas].sort((a, b) => a - b);
  const numeral = (etapa: IndiceDaEtapa) => ETAPAS_DA_FICHA[etapa - 1].replace(' ETAPA', '');
  if (ordenadas.length === 1) return `${numeral(ordenadas[0])} ETAPA`;
  const contiguas = ordenadas.every((etapa, i) => i === 0 || etapa === ordenadas[i - 1] + 1);
  if (contiguas && ordenadas.length > 2) return `${numeral(ordenadas[0])} a ${numeral(ordenadas.at(-1)!)} ETAPA`;
  return `${ordenadas.slice(0, -1).map(numeral).join(', ')} e ${numeral(ordenadas.at(-1)!)} ETAPA`;
}

/**
 * Reads the professor's observações with the agent and builds the prévia:
 * every estudante of the turma with R in every habilidade of the chosen áreas
 * and etapas, lowered where the observações said so. Saved, so the auxiliar
 * can review it over time; it replaces any earlier prévia.
 */
fichaDeDesempenho.post('/:id/ficha-de-desempenho/previas', async (context) => {
  const caderneta = await cadernetaDaRota(context.req.param('id'), context.req.query('turma'));
  if (!caderneta) return context.json({ error: 'Caderneta não encontrada.' }, 404);

  const estrutura = await getEstruturaDaFicha(getDb(), caderneta.professorId, caderneta.turma);
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
  const etapas = etapasSchema.safeParse(campoJson(body.etapas));
  if (!etapas.success) return context.json({ error: 'Escolha ao menos uma etapa.' }, 400);
  const escolhidas = estrutura.areas.filter((area) => areas.data.includes(area.indice));
  if (escolhidas.length !== areas.data.length) {
    return context.json({ error: 'Uma das áreas escolhidas não existe nesta ficha. Releia a ficha no portal.' }, 422);
  }
  const etapasDaPrevia = [...new Set(etapas.data)].sort((a, b) => a - b);

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

  const turma = await listEstudantes(getDb(), caderneta.id, caderneta.turma);
  if (turma.length === 0) {
    return context.json({ error: 'A caderneta ainda não tem os estudantes lidos do portal. Sincronize e tente de novo.' }, 422);
  }

  try {
    const lidas = await interpretarObservacoes({
      turma: caderneta.turma,
      etapas: etapasDaPrevia,
      areas: escolhidas,
      estudantes: turma.map(({ matricula, nome }) => ({ matricula, nome })),
      texto: typeof body.texto === 'string' ? body.texto : '',
      arquivos,
    });
    const previa = await salvarPrevia(getDb(), caderneta.id, caderneta.turma, {
      areas: escolhidas.map((area) => area.indice),
      etapas: etapasDaPrevia,
      // Observações about the turma (or "a maioria") apply to everyone; one
      // about a named estudante's whole área applies to that estudante. The
      // auxiliar fixes the exceptions in the prévia.
      estudantes: turma.map(({ matricula, nome, situacao }) => {
        const lido = lidas.estudantes.find((e) => e.matricula === matricula);
        const gerais = lidas.gerais.filter((geral) => !geral.estudante || geral.estudante.matricula === matricula);
        const excecoes = [...gerais.flatMap((geral) => geral.excecoes), ...(lido?.excecoes ?? [])];
        return {
          matricula,
          nome,
          situacao,
          trechos: [...new Set([...gerais.map((geral) => geral.trecho), ...(lido?.excecoes.map((e) => e.trecho) ?? [])])],
          conceitos: fichaInicial(escolhidas, etapasDaPrevia, excecoes),
        };
      }),
      gerais: [],
      naoResolvidos: lidas.naoResolvidos,
      descartadas: lidas.descartadas,
      resposta: lidas.resposta,
    });
    return context.json({ previa });
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

fichaDeDesempenho.get('/:id/ficha-de-desempenho/previas/atual', async (context) => {
  const caderneta = await cadernetaDaRota(context.req.param('id'), context.req.query('turma'));
  if (!caderneta) return context.json({ error: 'Caderneta não encontrada.' }, 404);
  return context.json({ previa: await getPrevia(getDb(), caderneta.id, caderneta.turma) });
});

fichaDeDesempenho.delete('/:id/ficha-de-desempenho/previas/atual', async (context) => {
  const caderneta = await cadernetaDaRota(context.req.param('id'), context.req.query('turma'));
  if (!caderneta) return context.json({ error: 'Caderneta não encontrada.' }, 404);
  await apagarPrevia(getDb(), caderneta.id, caderneta.turma);
  return context.body(null, 204);
});

/**
 * Do the screen's rows use exactly the habilidades the ficha has now for the
 * checked áreas? A renumbered área would move conceitos onto other habilidades.
 */
function mesmasHabilidades(conceitos: FichaPlanejada | undefined, areas: readonly number[], estrutura: readonly AreaDeConhecimento[]): boolean {
  if (!areas.every((indice) => estrutura.some((area) => area.indice === indice))) return false;
  if (!conceitos) return true;
  const esperadas = new Set(estrutura
    .filter((area) => areas.includes(area.indice))
    .flatMap((area) => area.habilidades.map((h) => chaveDaHabilidade(area.indice, h.indice))));
  const chaves = Object.keys(conceitos);
  return chaves.length === esperadas.size && chaves.every((chave) => esperadas.has(chave));
}

const chaveDaExecucao = (caderneta: Caderneta) => `${caderneta.id}|${caderneta.turma}`;

/**
 * Starts the preenchimento assistido from the saved prévia, in the
 * professor's headed window. Answers right away: the run follows the
 * auxiliar de ensino's Salvar e próximo for as long as they keep going, and
 * its progress is read from the status route.
 */
fichaDeDesempenho.post('/:id/ficha-de-desempenho/preenchimentos-assistidos', async (context) => {
  const caderneta = await cadernetaDaRota(context.req.param('id'), context.req.query('turma'));
  if (!caderneta) return context.json({ error: 'Caderneta não encontrada.' }, 404);

  const db = getDb();
  const previa = await getPrevia(db, caderneta.id, caderneta.turma);
  if (!previa) return context.json({ error: 'Gere a prévia da ficha antes de preencher o portal.' }, 422);

  // The screen's edits are not saved: they come with the request, on top of
  // the prévia version they were made on.
  const tela = previaEditadaSchema.safeParse(await context.req.json().catch(() => null));
  if (!tela.success) return context.json({ error: 'Prévia malformada.' }, 400);
  if (tela.data.versao !== previa.atualizadaEm) {
    return context.json({ error: 'A prévia foi gerada de novo em outro lugar. Abra a ficha outra vez.' }, 409);
  }
  const editados = new Map(tela.data.estudantes.map((e) => [e.matricula, e.conceitos]));
  const fora = [...editados.keys()].find((matricula) => !previa.estudantes.some((e) => e.matricula === matricula));
  if (fora) return context.json({ error: `A matrícula ${fora} não está na prévia.` }, 422);
  if (tela.data.naoResolvidos.some((item) => item.excecoes.length > 0)) {
    return context.json({ error: 'Há nomes nas observações que ainda não foram ligados a um estudante. Resolva ou ignore antes de preencher.' }, 422);
  }
  const estrutura = await getEstruturaDaFicha(db, caderneta.professorId, caderneta.turma);
  if (!estrutura || !mesmasHabilidades(tela.data.estudantes[0]?.conceitos, tela.data.areas, estrutura.areas)) {
    return context.json({ error: 'A ficha mudou desde a prévia. Releia a ficha no portal e gere a prévia de novo.' }, 422);
  }

  const credenciais = await lerCredenciaisDoProfessor(caderneta.professorId);
  if (!credenciais) return context.json({ error: 'Professor não encontrado.' }, 404);

  // What gets filled is the prévia as the screen shows it: its áreas, its
  // etapas, its edits — each row kept from decreasing.
  const daTela = ajustarPrevia(
    { ...previa, estudantes: previa.estudantes.map((e) => ({ ...e, conceitos: editados.get(e.matricula) ?? e.conceitos })) },
    estrutura.areas,
    tela.data.areas,
    tela.data.etapas,
  );
  const rotulo = rotuloDasEtapas(daTela.etapas);
  const plano = {
    periodoLetivo: await periodoLetivoDaTurma(db, caderneta.professorId, caderneta.turma),
    turma: caderneta.turma,
    etapas: daTela.etapas,
    rotuloDasEtapas: rotulo,
    areas: daTela.areas,
    // The situação is read now, not when the prévia was made: an estudante
    // transferred since then must not be filled.
    estudantes: (await listEstudantes(db, caderneta.id, caderneta.turma))
      .map(({ matricula, nome, situacao }) => ({ matricula, nome, situacao })),
    fichas: new Map(daTela.estudantes.map((e) => [
      e.matricula,
      Object.fromEntries(Object.entries(e.conceitos).map(([chave, linha]) => [chave, normalizarLinha(linha, daTela.etapas)])),
    ])),
    estrutura: estrutura.areas,
  };

  try {
    const inicial = iniciarPreenchimento(
      chaveDaExecucao(caderneta),
      { status: 'abrindo', etapa: rotulo, total: 0, atual: null, preenchidos: [], pulados: [], erro: null },
      (onEstado) => naSessaoHeaded(caderneta.professorId, credenciais, (page) =>
        acompanharPreenchimento(page, plano, onEstado)),
    );
    return context.json({ estado: inicial }, 202);
  } catch (error) {
    if (error instanceof PreenchimentoEmAndamentoError) return context.json({ error: error.message }, 409);
    throw error;
  }
});

fichaDeDesempenho.get('/:id/ficha-de-desempenho/preenchimentos-assistidos/atual', async (context) => {
  const caderneta = await cadernetaDaRota(context.req.param('id'), context.req.query('turma'));
  if (!caderneta) return context.json({ error: 'Caderneta não encontrada.' }, 404);
  return context.json({ estado: estadoDoPreenchimento(chaveDaExecucao(caderneta)) });
});
