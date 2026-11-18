import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthProvider } from '../supabase';

const config = { url: 'https://auth-tests.example.test', publishableKey: 'sb_publishable_tests', auxiliarId: '00000000-0000-4000-8000-000000000001', auxiliarEmail: 'auxiliar@example.test' };
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const user = { id: config.auxiliarId, email: config.auxiliarEmail, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };
function jwt(overrides: Record<string, unknown> = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: jwk.kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: config.auxiliarId, aud: 'authenticated', iss: `${config.url}/auth/v1`, role: 'authenticated', iat: Math.floor(Date.now() / 1000) - 60, exp: Math.floor(Date.now() / 1000) + 3600, ...overrides })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), pair.privateKey).toString('base64url')}`;
}
function body(access_token = jwt(), expires_at = Math.floor(Date.now() / 1000) + 3600) {
  return { access_token, refresh_token: 'private-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at, user };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let calls: { url: string; body?: string }[];
let initial: ReturnType<typeof body>;
let failRefresh: boolean;

beforeEach(() => {
  calls = []; initial = body(); failRefresh = false;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
    if (url.includes('grant_type=refresh_token')) {
      if (failRefresh) return json({ message: 'provider unavailable' }, 503);
      return json(body());
    }
    if (url.includes('grant_type=password')) return json(initial);
    if (url.includes('/.well-known/jwks.json')) return json({ keys: [jwk] });
    if (url.includes('/user')) return json(user);
    if (url.includes('/logout')) return json({});
    if (url.includes('/resend') || url.includes('/otp')) return json({});
    throw new Error(`Unexpected test endpoint: ${new URL(url).pathname}`);
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('real Supabase SDK boundary', () => {
  it('fails closed on absent configuration and rejects secret keys', async () => {
    const provider = createAuthProvider({ ...config, url: '', publishableKey: 'sb_secret_never-publish' });
    expect(provider.configured).toBe(false);
    await expect(provider.signIn(config.auxiliarEmail, 'senha')).rejects.toMatchObject({ status: 503 });
    expect(calls).toEqual([]);
  });
  it('validates a signed JWT and keeps the refresh token inside the process', async () => {
    const remote = await createAuthProvider(config).signIn(config.auxiliarEmail, 'senha');
    expect(await remote.accessToken()).toBe(initial.access_token);
    expect(remote).not.toHaveProperty('refresh_token');
    expect(remote.emailVerified).toBe(true);
  });
  it('rejects a signed token with the wrong issuer or audience', async () => {
    for (const overrides of [{ iss: 'https://different.example.test/auth/v1' }, { aud: 'anon' }]) {
      initial = body(jwt(overrides));
      const remote = await createAuthProvider(config).signIn(config.auxiliarEmail, 'senha');
      await expect(remote.accessToken()).rejects.toMatchObject({ status: 401 });
    }
  });
  it('serializes refreshes when several protected requests arrive together', async () => {
    initial = body(jwt(), Math.floor(Date.now() / 1000) - 1);
    const remote = await createAuthProvider(config).signIn(config.auxiliarEmail, 'senha');
    await Promise.all([remote.accessToken(), remote.accessToken(), remote.accessToken()]);
    expect(calls.filter((call) => call.url.includes('grant_type=refresh_token'))).toHaveLength(1);
  });
  it('maps provider rate limiting without leaking its response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'private provider details' }, 429)));
    await expect(createAuthProvider(config).signIn(config.auxiliarEmail, 'senha')).rejects.toMatchObject({ status: 429 });
  });
  it('confirms existing professores without the passwordless-signup flow that can clear their senha', async () => {
    await createAuthProvider(config).sendCode('professor@example.test');
    const sent = calls.find((call) => call.url.endsWith('/resend'));
    expect(JSON.parse(sent!.body!)).toMatchObject({ type: 'signup', email: 'professor@example.test' });
    expect(calls.some((call) => call.url.endsWith('/otp'))).toBe(false);
  });
  it('rejects requests during failed refresh without replacing the identity or using a local senha', async () => {
    vi.useFakeTimers();
    initial = body(jwt(), Math.floor(Date.now() / 1000) - 1); failRefresh = true;
    const remote = await createAuthProvider(config).signIn(config.auxiliarEmail, 'senha');
    const rejected = expect(remote.accessToken()).rejects.toMatchObject({ status: 503 });
    await vi.runAllTimersAsync();
    await rejected;
    failRefresh = false;
    await vi.advanceTimersByTimeAsync(61_000);
    expect(await remote.accessToken()).toEqual(expect.any(String));
    expect(calls.filter((call) => call.url.includes('grant_type=password'))).toHaveLength(1);
  });
  it('ends the local provider handle even if remote sign-out fails', async () => {
    const remote = await createAuthProvider(config).signIn(config.auxiliarEmail, 'senha');
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'unavailable' }, 503)));
    await expect(remote.signOut('local')).rejects.toMatchObject({ status: 503 });
    await expect(remote.accessToken()).rejects.toMatchObject({ status: 401 });
  });
});
