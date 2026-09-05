import { serve } from '@hono/node-server';

import { createApp } from './app';
import { iniciarAgendaSemanal, pararAgendaSemanal } from './cadernetas/agenda';
import { closeAllSessions } from './portal-sessions';
import { fecharSessoesHeaded } from './sessoes-headed';
import { env } from './env';

const app = createApp();

const server = serve({ fetch: app.fetch, port: env.port }, ({ port }) => {
  console.log(`API em http://localhost:${port}`);
  console.log(`Portal: ${env.portalUrl}`);
  iniciarAgendaSemanal();
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
    pararAgendaSemanal();
    void Promise.all([closeAllSessions(), fecharSessoesHeaded()]).finally(() =>
      process.exit(0),
    );
  });
}
