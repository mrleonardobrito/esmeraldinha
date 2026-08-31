import { Hono } from 'hono';

import { cadernetas } from './cadernetas';
import { professores } from './professores';

export function createApp(): Hono {
  const app = new Hono();

  app.get('/api/health', (context) => context.json({ ok: true }));
  app.route('/api/cadernetas', cadernetas);
  app.route('/api/professores', professores);

  return app;
}
