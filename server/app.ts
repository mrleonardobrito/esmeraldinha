import { Hono } from 'hono';

import { cadernetas } from './cadernetas';
import { conta } from './conta';
import { exigirAuxiliarDeEnsino, exigirSenhaDefinitiva, exigirSessao } from './conta/autenticacao';
import { professores } from './professores';
import { turmas } from './turmas';

export function createApp(): Hono {
  const app = new Hono();

  app.get('/api/health', (context) => context.json({ ok: true }));
  app.route('/api/conta', conta);

  for (const rota of ['/api/cadernetas', '/api/professores', '/api/turmas']) {
    app.use(rota, exigirSessao, exigirSenhaDefinitiva);
    app.use(`${rota}/*`, exigirSessao, exigirSenhaDefinitiva);
  }

  for (const rota of ['/api/professores', '/api/turmas']) {
    app.use(rota, exigirAuxiliarDeEnsino);
    app.use(`${rota}/*`, exigirAuxiliarDeEnsino);
  }

  app.route('/api/cadernetas', cadernetas);
  app.route('/api/professores', professores);
  app.route('/api/turmas', turmas);

  return app;
}
