import { Hono } from 'hono';
import { preenchimentoDeConteudosSchema, verificacaoDeConteudosSchema } from '../../shared/preenchimento-de-conteudos';
import type { ContaEnv } from '../conta/autenticacao';
import { createEncryptionPort } from '../encryption';
import { closeSession, openSession } from '../portal-sessions';
import { getDb } from '../professores/db';
import { getProfessorCredenciais } from '../professores/store';
import { LoginError, MissingAulaRowsError } from '../scrape/errors';
import { listAulas, prepararAulasParaPreenchimento } from '../scrape/portal';
import type { AulaDoPortal } from '../scrape/types';
import { naSessaoHeaded } from '../sessoes-headed';
import { periodoLetivoDaTurma } from '../turmas/store';
import { atualizarConteudosDoMes, CadernetaNotFoundError, getCaderneta, listAulasDaEtapa } from './store';

export const preenchimentosDeConteudo = new Hono<ContaEnv>();

for (const operation of ['preenchimentos-assistidos', 'verificacoes'] as const) {
  preenchimentosDeConteudo.post(`/:id/conteudos/${operation}`, async (context) => {
    const schema = operation === 'verificacoes' ? verificacaoDeConteudosSchema : preenchimentoDeConteudosSchema;
    const parsed = schema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: 'Informe a etapa e as aulas selecionadas.' }, 400);

    const { etapa, aulas } = parsed.data;
    const db = getDb();
    let caderneta;
    try {
      caderneta = getCaderneta(db, context.req.param('id'), context.req.query('turma'));
    } catch (error) {
      if (error instanceof CadernetaNotFoundError) return context.json({ error: error.message }, 404);
      throw error;
    }
    const conhecidas = listAulasDaEtapa(db, caderneta.id, etapa, caderneta.turma);
    if (aulas.some((aula) => !conhecidas.some((known) => known.mes === aula.mes &&
      known.data === aula.data && known.ordem === aula.ordem))) {
      return context.json({ error: 'Uma das aulas não pertence a esta etapa da caderneta.' }, 422);
    }
    const credenciais = await getProfessorCredenciais(db, createEncryptionPort(), caderneta.professorId);
    if (!credenciais) return context.json({ error: 'Professor não encontrado.' }, 404);

    const periodoLetivo = periodoLetivoDaTurma(db, caderneta.professorId, caderneta.turma);
    let sessionId: string | undefined;
    try {
      if (operation === 'preenchimentos-assistidos') {
        const input = preenchimentoDeConteudosSchema.parse(parsed.data);
        await naSessaoHeaded(caderneta.professorId, credenciais, (page) =>
          prepararAulasParaPreenchimento(page, input.aulas.map(({ mes, data, ordem, ...conteudo }) => ({
            periodoLetivo, etapa, turma: caderneta.turma, mes, data,
            ...(ordem === null ? {} : { ordem }),
            conteudo: { ...conteudo, isRecuperacao: 'Não', isInteracao: 'Não' },
          }))),
        );
        return context.json({ preparadas: aulas.length, meses: [...new Set(aulas.map((aula) => aula.mes))] });
      }

      // A fresh browser context reads saved values, never the unsaved review tabs.
      const session = await openSession(credenciais, { professorId: caderneta.professorId });
      sessionId = session.id;
      const porMes = new Map<string, AulaDoPortal[]>();
      for (const mes of new Set(aulas.map((aula) => aula.mes))) {
        porMes.set(mes, await listAulas(session.page, { periodoLetivo, etapa, turma: caderneta.turma, mes }));
      }
      for (const [mes, salvas] of porMes) atualizarConteudosDoMes(db, caderneta.id, etapa, mes, salvas, caderneta.turma);
      return context.json({ aulas: aulas.map((aula) => ({
        ...aula,
        preenchida: porMes.get(aula.mes)!.some((saved) => saved.data === aula.data &&
          (saved.ordem ?? null) === aula.ordem && saved.preenchida),
      })) });
    } catch (error) {
      if (error instanceof LoginError || error instanceof MissingAulaRowsError) {
        return context.json({ error: error.message }, 422);
      }
      console.error(`Failed conteúdo ${operation}:`, error);
      return context.json({ error: operation === 'verificacoes'
        ? 'Não foi possível verificar o que foi salvo. Seus rascunhos foram mantidos.'
        : 'Não foi possível preparar todas as aulas. Seus rascunhos foram mantidos.' }, 502);
    } finally {
      if (sessionId) await closeSession(sessionId);
    }
  });
}
