import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const parsed = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().startsWith('sb_secret_'),
  SUPABASE_AUXILIAR_EMAIL: z.email(),
}).safeParse(process.env);
if (!parsed.success) throw new Error('Set SUPABASE_URL, SUPABASE_SECRET_KEY and SUPABASE_AUXILIAR_EMAIL in the controlled administration environment.');
const config = parsed.data;
const endpoint = new URL(config.SUPABASE_URL);
if (endpoint.username || endpoint.password || (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)))) throw new Error('Supabase requires HTTPS outside local development.');
const sdk = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000), redirect: 'error' }) },
});
// The initial random senha is never returned; primeiro acesso uses a confirmation code.
const { data, error } = await sdk.auth.admin.createUser({
  email: config.SUPABASE_AUXILIAR_EMAIL,
  password: `${randomBytes(36).toString('base64url')}Aa1!`,
});
if (error || !data.user) throw new Error('The auxiliar identity could not be provisioned. Check the project and existing identities; no existing identity was reassigned.');
console.log(`SUPABASE_AUXILIAR_AUTH_ID=${data.user.id}`);
