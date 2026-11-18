import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { serve } from '@hono/node-server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { createAuthAdminApp } from './app';

const settings = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().startsWith('sb_secret_'),
  SUPABASE_AUXILIAR_AUTH_ID: z.uuid(),
  AUTH_ADMIN_JOURNAL_KEY: z.string().min(32),
  AUTH_ADMIN_DB_PATH: z.string().default('./data/auth-admin.db'),
  AUTH_ADMIN_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
}).safeParse(process.env);
if (!settings.success) throw new Error('Configure the Auth administration environment. Never copy its secret key to the desktop environment.');
const config = settings.data;
const endpoint = new URL(config.SUPABASE_URL);
if (endpoint.username || endpoint.password || (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)))) throw new Error('Supabase requires HTTPS outside local development.');
mkdirSync(dirname(config.AUTH_ADMIN_DB_PATH), { recursive: true });
const db = new DatabaseSync(config.AUTH_ADMIN_DB_PATH);
const sdk = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000), redirect: 'error' }) },
});
const app = createAuthAdminApp({ sdk, db, auxiliarId: config.SUPABASE_AUXILIAR_AUTH_ID, journalKey: config.AUTH_ADMIN_JOURNAL_KEY });
const server = serve({ fetch: app.fetch, port: config.AUTH_ADMIN_PORT, hostname: '127.0.0.1' });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
