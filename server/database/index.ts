import { serve } from '@hono/node-server';
import { z } from 'zod';
import { PostgresDatabase } from './postgres';

async function main() {
  const settings = z
    .object({
      DATABASE_URL: z.string().min(1),
      SERVER_ENCRYPTION_KEY: z.string().min(1),
      ENCRYPTION_ADAPTER: z.literal('server'),
      DATA_API_PORT: z.coerce.number().int().min(1).max(65535).default(3003),
    })
    .safeParse(process.env);
  if (!settings.success)
    throw new Error(
      `Configure server settings: ${settings.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  if (process.env.ESMERALDINHA_DATA_API_URL)
    throw new Error('The hosted API must not proxy to itself.');
  process.env.ESMERALDINHA_DATABASE = 'postgres';
  process.env.ESMERALDINHA_PORTAL_AUTOMATION = 'desktop';
  const { createAuthProvider } = await import('../conta/supabase');
  const auth = createAuthProvider();
  if (!auth.configured)
    throw new Error(
      'Configure the public Supabase settings and expected auxiliar identity on the server.',
    );
  const { createEncryptionPort } = await import('../encryption');
  createEncryptionPort();
  const { getDb, closeDb } = await import('../professores/db');
  const db = getDb();
  if (!(db instanceof PostgresDatabase))
    throw new Error('The data API requires Postgres.');
  await db.verifyRuntimeRole();
  const { createDataService } = await import('./service');
  const { encerrarTodasAsSessoes } = await import('../conta/sessoes');
  const server = serve({
    fetch: createDataService({ auth }).fetch,
    port: settings.data.DATA_API_PORT,
    hostname: '127.0.0.1',
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      server.close();
      const deadline = setTimeout(() => process.exit(0), 5000);
      deadline.unref();
      void Promise.allSettled([encerrarTodasAsSessoes(), closeDb()]).finally(
        () => process.exit(0),
      );
    });
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.message.startsWith('Configure')
      ? error.message
      : 'Data API startup failed. Check the database role, migrations, TLS, and server configuration.',
  );
  process.exit(1);
});
