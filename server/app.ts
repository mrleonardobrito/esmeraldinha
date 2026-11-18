import { Hono } from 'hono';

import { cadernetas } from './cadernetas';
import { conta } from './conta';
import {
  exigirAuxiliarDeEnsino,
  exigirSenhaDefinitiva,
  exigirSessao,
} from './conta/autenticacao';
import { professores } from './professores';
import { turmas } from './turmas';
import {
  AuthFailure,
  createAuthProvider,
  type AuthProvider,
} from './conta/supabase';
import type { ContaEnv } from './conta/autenticacao';
import { env } from './env';
import { proxyConta, proxyProfessores } from './database/remote-auth';
import { localMigration } from './database/local-migration';

export function createApp(
  options: { auth?: AuthProvider } = {},
): Hono<ContaEnv> {
  const app = new Hono<ContaEnv>();
  const auth = options.auth ?? createAuthProvider();
  app.use('*', async (context, next) => {
    context.set('auth', auth);
    await next();
  });
  app.onError((error, context) => {
    if (error instanceof AuthFailure)
      return context.json({ error: error.message }, error.status);
    console.error('API request failed:', error.name);
    return context.json(
      { error: 'Não foi possível concluir a operação.' },
      500,
    );
  });

  app.get('/api/health', (context) => context.json({ ok: true }));
  if (env.dataApiUrl) {
    app.all('/api/conta', proxyConta);
    app.all('/api/conta/*', proxyConta);
  }
  app.route('/api/conta', conta);

  for (const rota of [
    '/api/cadernetas',
    '/api/professores',
    '/api/turmas',
    '/api/migration',
  ]) {
    app.use(rota, exigirSessao, exigirSenhaDefinitiva);
    app.use(`${rota}/*`, exigirSessao, exigirSenhaDefinitiva);
  }

  for (const rota of ['/api/professores', '/api/turmas', '/api/migration']) {
    app.use(rota, exigirAuxiliarDeEnsino);
    app.use(`${rota}/*`, exigirAuxiliarDeEnsino);
  }

  app.route('/api/cadernetas', cadernetas);
  if (env.dataApiUrl) {
    app.all('/api/professores', proxyProfessores);
    app.all('/api/professores/*', proxyProfessores);
  }
  app.route('/api/professores', professores);
  app.route('/api/turmas', turmas);
  app.route('/api/migration', localMigration);

  return app;
}
