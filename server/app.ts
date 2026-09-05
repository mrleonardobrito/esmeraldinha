import { Hono } from 'hono';

import { cadernetas } from './cadernetas';
import { professores } from './professores';
import { turmas } from './turmas';

export function createApp(): Hono {
  const app = new Hono();

  app.get('/api/health', (context) => context.json({ ok: true }));
  app.route('/api/cadernetas', cadernetas);
  app.route('/api/professores', professores);
  app.route('/api/turmas', turmas);

  return app;
}
