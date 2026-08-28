import { Hono } from 'hono';

import { cadernetas } from './cadernetas';

/**
 * A API sem servidor HTTP: `server/index.ts` a serve com Node em
 * desenvolvimento e o Electron a chama direto pelo protocolo `app://`.
 */
export function createApp(): Hono {
  const app = new Hono();

  app.get('/api/health', (context) => context.json({ ok: true }));
  app.route('/api/cadernetas', cadernetas);

  return app;
}
