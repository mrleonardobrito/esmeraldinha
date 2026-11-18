import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { conta } from '../conta';
import { professores } from '../professores';
import {
  exigirSessao,
  exigirSenhaDefinitiva,
  exigirAuxiliarDeEnsino,
  type ContaEnv,
} from '../conta/autenticacao';
import { restringirValores } from '../conta/valores';
import {
  AuthFailure,
  createAuthProvider,
  type AuthProvider,
} from '../conta/supabase';
import { createEncryptionPort } from '../encryption';
import { getDb } from '../professores/db';
import * as professoresStore from '../professores/store';
import * as turmasStore from '../turmas/store';
import * as cadernetasStore from '../cadernetas/store';
import * as codigosStore from '../codigos-cr/store';
import * as fichasStore from '../fichas/store';
import * as classificacoesStore from '../notas/classificacoes';
import { reconcileCadernetasDeReducao } from '../cadernetas/reducao';
import { garantirCatalogoDeCodigosCR } from '../codigos-cr/catalogo';
import type { Database } from './types';
import { importSqlite, migrationSchema } from './migration';
import { encerrarSessoesDaConta } from '../conta/sessoes';
import { operationSchemas } from './operation-schemas';

interface Operation {
  execute(args: unknown[]): Promise<unknown>;
  scope:
    | 'professor'
    | 'caderneta'
    | 'turma'
    | 'auxiliar'
    | 'catalogo'
    | 'create';
}
function operation<A extends unknown[], R>(
  scope: Operation['scope'],
  work: (db: Database, ...args: A) => Promise<R>,
): Operation {
  return { scope, execute: (args) => work(getDb(), ...(args as A)) };
}

const operations = new Map<string, Operation>([
  [
    'professores.getProfessor',
    operation('professor', professoresStore.getProfessor),
  ],
  [
    'professores.listProfessores',
    operation('auxiliar', professoresStore.listProfessores),
  ],
  [
    'professores.getProfessorCredenciais',
    operation('professor', (db, id: string) =>
      professoresStore.getProfessorCredenciais(db, createEncryptionPort(), id),
    ),
  ],
  ['turmas.listTurmas', operation('professor', turmasStore.listTurmas)],
  ['turmas.getTurma', operation('turma', turmasStore.getTurma)],
  ['turmas.replaceTurmas', operation('auxiliar', turmasStore.replaceTurmas)],
  [
    'turmas.periodoLetivoDaTurma',
    operation('professor', turmasStore.periodoLetivoDaTurma),
  ],
  ['turmas.listEstudantes', operation('turma', turmasStore.listEstudantes)],
  [
    'turmas.replaceEstudantes',
    operation('auxiliar', turmasStore.replaceEstudantes),
  ],
  ['turmas.updateTurma', operation('auxiliar', turmasStore.updateTurma)],
  [
    'turmas.updateEstudante',
    operation('auxiliar', turmasStore.updateEstudante),
  ],
  [
    'cadernetas.createCaderneta',
    operation('create', cadernetasStore.createCaderneta),
  ],
  [
    'cadernetas.listCadernetas',
    operation('professor', cadernetasStore.listCadernetas),
  ],
  [
    'cadernetas.findCadernetaDaTurma',
    operation('professor', async (db, professorId: string, turma: string) =>
      (await cadernetasStore.findCadernetaDaTurma(db, professorId, turma)) ?? null,
    ),
  ],
  [
    'cadernetas.reconcileCadernetasDeReducao',
    operation('professor', reconcileCadernetasDeReducao),
  ],
  [
    'cadernetas.getCaderneta',
    operation('caderneta', cadernetasStore.getCaderneta),
  ],
  [
    'cadernetas.listAulasDaEtapa',
    operation('caderneta', cadernetasStore.listAulasDaEtapa),
  ],
  [
    'cadernetas.marcarSincronizando',
    operation('caderneta', cadernetasStore.marcarSincronizando),
  ],
  [
    'cadernetas.marcarFalhaNaSincronizacao',
    operation('caderneta', cadernetasStore.marcarFalhaNaSincronizacao),
  ],
  [
    'cadernetas.listEstudantes',
    operation('caderneta', cadernetasStore.listEstudantes),
  ],
  [
    'cadernetas.syncCaderneta',
    operation('caderneta', cadernetasStore.syncCaderneta),
  ],
  [
    'cadernetas.syncCadernetaTurmas',
    operation('caderneta', cadernetasStore.syncCadernetaTurmas),
  ],
  [
    'cadernetas.atualizarConteudosDoMes',
    operation('caderneta', cadernetasStore.atualizarConteudosDoMes),
  ],
  [
    'cadernetas.marcarConteudoPreenchido',
    operation('caderneta', cadernetasStore.marcarConteudoPreenchido),
  ],
  [
    'cadernetas.deleteCaderneta',
    operation('caderneta', cadernetasStore.deleteCaderneta),
  ],
  [
    'cadernetas.listDisciplinasDaCaderneta',
    operation('caderneta', cadernetasStore.listDisciplinasDaCaderneta),
  ],
  [
    'cadernetas.listAvaliacoesDoProfessor',
    operation('professor', cadernetasStore.listAvaliacoesDoProfessor),
  ],
  [
    'cadernetas.getBoletimDaEtapa',
    operation('caderneta', cadernetasStore.getBoletimDaEtapa),
  ],
  [
    'cadernetas.marcarNotasLancadas',
    operation('caderneta', cadernetasStore.marcarNotasLancadas),
  ],
  [
    'cadernetas.updateValores',
    operation('auxiliar', cadernetasStore.updateValores),
  ],
  ['cadernetas.listTodas', operation('auxiliar', cadernetasStore.listTodas)],
  [
    'notas.getClassificacaoPadrao',
    operation('professor', classificacoesStore.getClassificacaoPadrao),
  ],
  [
    'notas.setClassificacaoPadrao',
    operation('professor', classificacoesStore.setClassificacaoPadrao),
  ],
  [
    'notas.listClassificacoes',
    operation('professor', classificacoesStore.listClassificacoes),
  ],
  [
    'notas.salvarClassificacoes',
    operation('professor', classificacoesStore.salvarClassificacoes),
  ],
  [
    'fichas.getEstruturaDaFicha',
    operation('professor', fichasStore.getEstruturaDaFicha),
  ],
  [
    'fichas.salvarEstruturaDaFicha',
    operation('professor', fichasStore.salvarEstruturaDaFicha),
  ],
  ['fichas.getPrevia', operation('caderneta', fichasStore.getPrevia)],
  ['fichas.salvarPrevia', operation('caderneta', fichasStore.salvarPrevia)],
  ['fichas.apagarPrevia', operation('caderneta', fichasStore.apagarPrevia)],
  [
    'codigos-cr.listCodigosCR',
    operation('catalogo', codigosStore.listCodigosCR),
  ],
  ['codigos-cr.findCodigoCR', operation('catalogo', codigosStore.findCodigoCR)],
  [
    'codigos-cr.replaceCodigosCR',
    operation('auxiliar', codigosStore.replaceCodigosCR),
  ],
  [
    'codigos-cr.garantirCatalogoDeCodigosCR',
    operation('catalogo', garantirCatalogoDeCodigosCR),
  ],
]);

/** Fixed domain API: browser automation remains in the desktop process. */
export function createDataService(
  options: { auth?: AuthProvider } = {},
): Hono<ContaEnv> {
  const app = new Hono<ContaEnv>();
  const auth = options.auth ?? createAuthProvider();
  app.use('*', bodyLimit({ maxSize: 32 * 1024 * 1024 }));
  app.use('*', async (context, next) => {
    context.set('auth', auth);
    await next();
  });
  app.onError((error, context) => {
    if (error instanceof AuthFailure)
      return context.json({ error: error.message }, error.status);
    if (
      error instanceof cadernetasStore.CadernetaNotFoundError ||
      error instanceof turmasStore.TurmaNotFoundError ||
      error instanceof professoresStore.ProfessorNotFoundError
    )
      return context.json({ error: error.message, kind: error.name }, 404);
    if (error instanceof cadernetasStore.CadernetaInvalidaError)
      return context.json({ error: error.message, kind: error.name }, 422);
    if (
      error instanceof cadernetasStore.TurmaJaCadastradaError ||
      error instanceof professoresStore.DuplicateLoginError
    )
      return context.json({ error: error.message, kind: error.name }, 409);
    console.error('Data operation failed:', error.name);
    return context.json(
      { error: 'Não foi possível concluir a operação.' },
      503,
    );
  });
  app.get('/api/health', async (context) => {
    await getDb().prepare('SELECT 1').get();
    return context.json({ ok: true });
  });
  app.route('/api/conta', conta);
  for (const path of ['/api/data', '/api/professores', '/api/import']) {
    app.use(path, exigirSessao, exigirSenhaDefinitiva);
    app.use(`${path}/*`, exigirSessao, exigirSenhaDefinitiva);
  }
  app.use('/api/professores', exigirAuxiliarDeEnsino);
  app.use('/api/professores/*', exigirAuxiliarDeEnsino);
  app.route('/api/professores', professores);
  app.use('/api/import', exigirAuxiliarDeEnsino);
  app.post('/api/import', async (context) => {
    const input = migrationSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return context.json({ error: 'Invalid migration payload.' }, 422);
    const result = await importSqlite({
      db: getDb(),
      encryption: createEncryptionPort(),
      auth,
      session: context.get('sessao').provider,
      payload: input.data,
    });
    if (!result.repeated)
      await encerrarSessoesDaConta(context.get('conta')!.id);
    return context.json({ ...result, requiresLogin: !result.repeated });
  });
  app.use('/api/data', restringirValores);
  app.post('/api/data', async (context) => {
    const input = z
      .object({
        operation: z.string().max(100),
        args: z.array(z.unknown()).max(10),
      })
      .strict()
      .safeParse(await context.req.json().catch(() => null));
    if (!input.success)
      return context.json({ error: 'Invalid data operation.' }, 400);
    const action = operations.get(input.data.operation);
    if (!action) return context.json({ error: 'Unknown data operation.' }, 400);
    const args = operationSchemas
      .get(input.data.operation)
      ?.safeParse(input.data.args);
    if (!args?.success)
      return context.json({ error: 'Os dados enviados não são válidos.' }, 422);
    input.data.args = args.data;
    const identity = context.get('identidade');
    if (identity.papel === 'professor') {
      if (action.scope === 'auxiliar')
        throw new AuthFailure('Esta ação não está autorizada.', 403);
      if (action.scope !== 'catalogo') {
        const target =
          action.scope === 'create'
            ? (input.data.args[0] as { professorId?: unknown } | null)
                ?.professorId
            : input.data.args[0];
        if (typeof target !== 'string')
          return context.json({ error: 'Invalid reference.' }, 400);
        const professorId =
          action.scope === 'caderneta'
            ? (await cadernetasStore.getCaderneta(getDb(), target)).professorId
            : action.scope === 'turma'
              ? (await turmasStore.getTurma(getDb(), target)).professorId
              : target;
        if (professorId !== identity.professorId)
          throw new AuthFailure('Esta ação não está autorizada.', 403);
      }
    }
    return context.json({ result: await action.execute(input.data.args) });
  });
  return app;
}
