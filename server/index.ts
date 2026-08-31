import { serve } from '@hono/node-server';

import { createApp } from './app';
import { closeAllSessions } from './portal-sessions';
import { env } from './env';

const app = createApp();

const server = serve({ fetch: app.fetch, port: env.port }, ({ port }) => {
  console.log(`API em http://localhost:${port}`);
  console.log(`Portal: ${env.portalUrl}`);
  for (const [feature, headless] of Object.entries(env.headless)) {
    console.log(
      `Navegador (${feature}): ${
        headless
          ? 'headless'
          : `visível (${feature.toUpperCase()}_HEADLESS=false)`
      }`,
    );
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    void closeAllSessions().finally(() => process.exit(0));
  });
}
