import { Hono } from 'hono';

import { cadernetas } from './cadernetas';
import { createContaRoutes } from './conta';
import { createExigirSessao, exigirAuxiliarDeEnsino, exigirSenhaDefinitiva } from './conta/autenticacao';
import { createEncryptionPort } from './encryption';
import { env } from './env';
import { createLocalIdentityInfrastructure } from './infrastructure/local';
import { createMemorySessions } from './infrastructure/sessions';
import { createIdentityService } from './modules/identity';
import { getDb } from './professores/db';
import { createProfessoresRoutes } from './professores';
import { turmas } from './turmas';

export function createApp(): Hono {
  const app = new Hono();

  const identity = createIdentityService({
    ...createLocalIdentityInfrastructure({
      db: getDb,
      encryption: createEncryptionPort,
      conta: { login: env.conta.login, senhaTemporaria: env.conta.senhaTemporaria },
    }),
    sessions: createMemorySessions({ idleMs: env.conta.sessaoIdleMs }),
  });
  const exigirSessao = createExigirSessao(identity);

  app.get('/api/health', (context) => context.json({ ok: true }));
  app.route('/api/conta', createContaRoutes(identity, exigirSessao));

  for (const rota of ['/api/cadernetas', '/api/professores', '/api/turmas']) {
    app.use(rota, exigirSessao, exigirSenhaDefinitiva);
    app.use(`${rota}/*`, exigirSessao, exigirSenhaDefinitiva);
  }

  for (const rota of ['/api/professores', '/api/turmas']) {
    app.use(rota, exigirAuxiliarDeEnsino);
    app.use(`${rota}/*`, exigirAuxiliarDeEnsino);
  }

  app.route('/api/cadernetas', cadernetas);
  app.route('/api/professores', createProfessoresRoutes(identity));
  app.route('/api/turmas', turmas);

  return app;
}
