import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthAdminApp } from './app';

const auxiliarId = '00000000-0000-4000-8000-000000000001';
const professorId = '00000000-0000-4000-8000-000000000002';
const email = 'professor@example.test';
let db: DatabaseSync;

function fixture() {
  const users = new Map<string, User>();
  let failAfterWrite = false;
  let failAfterDelete = false;
  const sdk = {
    auth: {
      getUser: vi.fn(async (token: string) => ({ data: { user: { id: token === 'auxiliar' ? auxiliarId : professorId, email_confirmed_at: '2026-01-01' } }, error: null })),
      admin: {
        listUsers: vi.fn(async () => ({ data: { users: [...users.values()] }, error: null })),
        createUser: vi.fn(async (input: { email: string; app_metadata: Record<string, unknown> }) => {
          const user = { id: randomUUID(), email: input.email, app_metadata: input.app_metadata } as User;
          users.set(user.id, user);
          return { data: { user }, error: null };
        }),
        getUserById: vi.fn(async (id: string) => ({ data: { user: users.get(id) ?? null }, error: users.has(id) ? null : { status: 404 } })),
        updateUserById: vi.fn(async (id: string, input: { app_metadata?: Record<string, unknown> }) => {
          const user = users.get(id)!;
          Object.assign(user, input);
          if (failAfterWrite) { failAfterWrite = false; return { data: { user: null }, error: { status: 503 } }; }
          return { data: { user }, error: null };
        }),
        deleteUser: vi.fn(async (id: string) => {
          users.delete(id);
          if (failAfterDelete) { failAfterDelete = false; return { data: {}, error: { status: 503 } }; }
          return { data: {}, error: null };
        }),
      },
    },
  };
  const create = () => createAuthAdminApp({ db, sdk: sdk as unknown as SupabaseClient, auxiliarId, journalKey: 'stable-test-journal-key-with-at-least-32-characters' });
  return { sdk, users, create, failWrite: () => { failAfterWrite = true; }, failDelete: () => { failAfterDelete = true; } };
}
function operation(overrides: Record<string, unknown> = {}) { return { operationId: randomUUID(), professorId, action: 'sync', email, senha: 'portal-senha', ...overrides }; }
function request(body: unknown, token = 'auxiliar') { return new Request('http://localhost/', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); }
beforeEach(() => { db = new DatabaseSync(':memory:'); });
afterEach(() => { db.close(); });

describe('hosted Auth administration', () => {
  it('requires the configured auxiliar identity before any privileged operation', async () => {
    const f = fixture();
    expect((await f.create().fetch(request(operation(), 'professor'))).status).toBe(403);
    expect(f.sdk.auth.admin.createUser).not.toHaveBeenCalled();
  });
  it('never takes over a remote identity based only on a matching email', async () => {
    const f = fixture(); f.users.set('foreign', { id: 'foreign', email, aud: 'authenticated', created_at: '2026-01-01', app_metadata: {}, user_metadata: { esmeraldinha: { auxiliarId, professorId } } } as User);
    expect((await f.create().fetch(request(operation()))).status).toBe(409);
    expect(f.sdk.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
  it('serializes repeated enrollment and never persists the plaintext senha', async () => {
    const f = fixture(); const app = f.create(); const input = operation();
    const results = await Promise.all([app.fetch(request(input)), app.fetch(request(input))]);
    expect(results.map((response) => response.status)).toEqual([200, 200]);
    expect(f.sdk.auth.admin.createUser).toHaveBeenCalledTimes(1);
    expect(f.sdk.auth.admin.updateUserById).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(db.prepare('SELECT * FROM operations').all())).not.toContain(input.senha);
    expect(JSON.stringify(db.prepare('SELECT * FROM assignments').all())).not.toContain(input.senha);
  });
  it('rejects changing the payload associated with a completed operation ID', async () => {
    const f = fixture(); const app = f.create(); const input = operation();
    expect((await app.fetch(request(input))).status).toBe(200);
    expect((await app.fetch(request({ ...input, senha: 'different-senha' }))).status).toBe(409);
  });
  it('recovers a write whose response was lost without setting the senha twice', async () => {
    const f = fixture(); const input = operation(); f.failWrite();
    expect((await f.create().fetch(request(input))).status).toBe(503);
    expect((await f.create().fetch(request(input))).status).toBe(200);
    expect(f.sdk.auth.admin.updateUserById).toHaveBeenCalledTimes(1);
  });
  it('returns fresh email verification state on an idempotent replay', async () => {
    const f = fixture(); const app = f.create(); const input = operation();
    const response = await app.fetch(request(input));
    const result = await response.json() as { id: string; verified: boolean };
    expect(result.verified).toBe(false);
    f.users.get(result.id)!.email_confirmed_at = '2026-01-01';
    expect(await (await app.fetch(request(input))).json()).toMatchObject({ verified: true });
  });
  it('checks server-maintained ownership again even for completed operations', async () => {
    const f = fixture(); const app = f.create(); const input = operation();
    const result = await (await app.fetch(request(input))).json() as { id: string };
    f.users.get(result.id)!.app_metadata.esmeraldinha.auxiliarId = 'another-auxiliar';
    expect((await app.fetch(request(input))).status).toBe(403);
  });
  it('rejects replaying an older operation after a later update', async () => {
    const f = fixture(); const app = f.create(); const first = operation();
    expect((await app.fetch(request(first))).status).toBe(200);
    expect((await app.fetch(request(operation({ senha: 'replacement-senha' })))).status).toBe(200);
    expect((await app.fetch(request(first))).status).toBe(409);
  });
  it('recovers deletion when the provider deleted the identity but lost its response', async () => {
    const f = fixture(); const app = f.create();
    await app.fetch(request(operation()));
    const input = operation({ action: 'delete', senha: undefined }); f.failDelete();
    expect((await app.fetch(request(input))).status).toBe(503);
    expect((await f.create().fetch(request(input))).status).toBe(200);
    expect(f.sdk.auth.admin.deleteUser).toHaveBeenCalledTimes(1);
    expect((await f.create().fetch(request(input))).status).toBe(200);
  });
});
