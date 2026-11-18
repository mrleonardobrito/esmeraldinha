import { createHmac } from 'node:crypto';
import type { Database } from '../database/types';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

const operationSchema = z
  .object({
    operationId: z.uuid(),
    professorId: z.uuid(),
    action: z.enum(['sync', 'revoke', 'delete', 'inspect']),
    email: z.email().transform((email) => email.toLowerCase()),
    senha: z.string().min(4).max(4096).optional(),
  })
  .refine((value) => value.action !== 'sync' || Boolean(value.senha));

interface Assignment {
  professor_id: string;
  auth_id: string;
  email: string;
  operation_id: string;
  deleted: number;
}

class ServiceFailure extends Error {
  constructor(readonly status: 401 | 403 | 409 | 422 | 429 | 503) {
    super('Auth administration failed.');
  }
}

/** Deploy one process with its own persistent database; never import this into Electron. */
export function createAuthAdminApp(options: {
  sdk: SupabaseClient;
  db: Database;
  auxiliarId: string;
  journalKey: string;
  schemaReady?: boolean;
}) {
  const { sdk, db, auxiliarId } = options;
  const ready = options.schemaReady
    ? Promise.resolve()
    : Promise.resolve(
        db.exec(`
    CREATE TABLE IF NOT EXISTS assignments (
      professor_id TEXT PRIMARY KEY,
      auth_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      operation_id TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY,
      professor_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      complete INTEGER NOT NULL DEFAULT 0
    );
  `),
      );
  const queues = new Map<string, Promise<unknown>>();
  let windowStart = Date.now();
  let attempts = 0;
  const app = new Hono();
  app.use('*', async (_context, next) => {
    await ready;
    await next();
  });
  app.use('*', bodyLimit({ maxSize: 16_384 }));
  app.onError((error, context) =>
    context.json(
      { error: 'Não foi possível administrar o acesso.' },
      error instanceof ServiceFailure ? error.status : 503,
    ),
  );

  async function remote<T extends { data: unknown; error: unknown }>(
    work: () => Promise<T>,
  ): Promise<T['data']> {
    let result;
    try {
      result = await work();
    } catch {
      throw new ServiceFailure(503);
    }
    if (result.error) {
      const status =
        typeof result.error === 'object' && 'status' in result.error
          ? Number(result.error.status)
          : 0;
      throw new ServiceFailure(
        status === 429
          ? 429
          : status === 422
            ? 422
            : status >= 400 && status < 500
              ? 409
              : 503,
      );
    }
    return result.data;
  }

  async function ownedUser(
    email: string,
    professorId: string,
  ): Promise<User | null> {
    for (let page = 1; page <= 100; page++) {
      const data = await remote(() =>
        sdk.auth.admin.listUsers({ page, perPage: 1000 }),
      );
      const found = data.users.find(
        (user) => user.email?.toLowerCase() === email,
      );
      if (found) {
        const assignment = found.app_metadata?.esmeraldinha;
        if (
          assignment?.auxiliarId !== auxiliarId ||
          assignment?.professorId !== professorId
        )
          throw new ServiceFailure(409);
        return found;
      }
      if (data.users.length < 1000) return null;
    }
    throw new ServiceFailure(503);
  }

  async function perform(input: z.infer<typeof operationSchema>) {
    if (input.action === 'inspect') {
      const assignment = (await db
        .prepare('SELECT * FROM assignments WHERE professor_id = ?')
        .get(input.professorId)) as Assignment | undefined;
      if (!assignment || assignment.deleted || assignment.email !== input.email)
        throw new ServiceFailure(409);
      const target = (
        await remote(() => sdk.auth.admin.getUserById(assignment.auth_id))
      ).user;
      if (
        !target ||
        target.id === auxiliarId ||
        target.email?.toLowerCase() !== assignment.email ||
        target.app_metadata?.esmeraldinha?.auxiliarId !== auxiliarId ||
        target.app_metadata?.esmeraldinha?.professorId !== input.professorId
      )
        throw new ServiceFailure(403);
      return {
        id: target.id,
        email: assignment.email,
        verified: Boolean(target.email_confirmed_at),
      };
    }
    const fingerprint = createHmac('sha256', options.journalKey)
      .update(JSON.stringify(input))
      .digest('hex');
    const previous = (await db
      .prepare('SELECT * FROM operations WHERE id = ?')
      .get(input.operationId)) as
      | { fingerprint: string; professor_id: string; complete: number }
      | undefined;
    if (
      previous &&
      (previous.fingerprint !== fingerprint ||
        previous.professor_id !== input.professorId)
    )
      throw new ServiceFailure(409);
    let assignment = (await db
      .prepare('SELECT * FROM assignments WHERE professor_id = ?')
      .get(input.professorId)) as Assignment | undefined;
    if (assignment?.deleted) {
      if (
        input.action === 'delete' &&
        assignment.operation_id === input.operationId
      )
        return {
          id: assignment.auth_id,
          email: assignment.email,
          verified: true,
        };
      throw new ServiceFailure(409);
    }
    if (
      assignment &&
      (assignment.email !== input.email ||
        (previous && assignment.operation_id !== input.operationId))
    )
      throw new ServiceFailure(409);
    if (previous?.complete && assignment) {
      const authId = assignment.auth_id;
      const data = await remote(() => sdk.auth.admin.getUserById(authId));
      if (
        !data.user ||
        data.user.id === auxiliarId ||
        data.user.email?.toLowerCase() !== assignment.email ||
        data.user.app_metadata?.esmeraldinha?.auxiliarId !== auxiliarId ||
        data.user.app_metadata?.esmeraldinha?.professorId !== input.professorId
      )
        throw new ServiceFailure(403);
      return {
        id: data.user.id,
        email: assignment.email,
        verified: Boolean(data.user.email_confirmed_at),
      };
    }
    await db
      .prepare(
        'INSERT INTO operations (id, professor_id, fingerprint) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING',
      )
      .run(input.operationId, input.professorId, fingerprint);
    const reserved = (await db
      .prepare('SELECT fingerprint, professor_id FROM operations WHERE id = ?')
      .get(input.operationId)) as { fingerprint: string; professor_id: string };
    if (
      reserved.fingerprint !== fingerprint ||
      reserved.professor_id !== input.professorId
    )
      throw new ServiceFailure(409);

    if (!assignment) {
      if (input.action !== 'sync') throw new ServiceFailure(409);
      let user = await ownedUser(input.email, input.professorId);
      if (!user) {
        const result = await remote(() =>
          sdk.auth.admin.createUser({
            email: input.email,
            password: input.senha!,
            app_metadata: {
              esmeraldinha: { auxiliarId, professorId: input.professorId },
            },
          }),
        );
        user = result.user;
      }
      if (!user || user.id === auxiliarId) throw new ServiceFailure(409);
      await db
        .prepare(
          'INSERT INTO assignments (professor_id, auth_id, email, operation_id) VALUES (?, ?, ?, ?)',
        )
        .run(input.professorId, user.id, input.email, input.operationId);
      assignment = (await db
        .prepare('SELECT * FROM assignments WHERE professor_id = ?')
        .get(input.professorId)) as unknown as Assignment;
    }

    const authId = assignment.auth_id;
    const lookup = await sdk.auth.admin.getUserById(authId);
    if (input.action === 'delete' && lookup.error?.status === 404) {
      await db
        .prepare(
          'UPDATE assignments SET deleted = TRUE, operation_id = ? WHERE professor_id = ?',
        )
        .run(input.operationId, input.professorId);
      await db
        .prepare('UPDATE operations SET complete = TRUE WHERE id = ?')
        .run(input.operationId);
      return { id: authId, email: assignment.email, verified: true };
    }
    if (lookup.error) throw new ServiceFailure(503);
    const target = lookup.data.user;
    if (
      !target ||
      target.email?.toLowerCase() !== assignment.email ||
      target.app_metadata?.esmeraldinha?.auxiliarId !== auxiliarId ||
      target.app_metadata?.esmeraldinha?.professorId !== input.professorId ||
      target.id === auxiliarId
    )
      throw new ServiceFailure(403);
    // Persist the new operation before the remote write so restart/retry uses the same intent.
    await db
      .prepare('UPDATE assignments SET operation_id = ? WHERE professor_id = ?')
      .run(input.operationId, input.professorId);
    if (input.action === 'delete') {
      await remote(() => sdk.auth.admin.deleteUser(target.id));
      await db
        .prepare('UPDATE assignments SET deleted = TRUE WHERE professor_id = ?')
        .run(input.professorId);
    } else if (
      target.app_metadata?.esmeraldinha?.operationId !== input.operationId
    ) {
      await remote(() =>
        sdk.auth.admin.updateUserById(target.id, {
          ...(input.action === 'sync' ? { password: input.senha! } : {}),
          ban_duration: input.action === 'revoke' ? '876000h' : 'none',
          app_metadata: {
            ...target.app_metadata,
            esmeraldinha: {
              auxiliarId,
              professorId: input.professorId,
              operationId: input.operationId,
            },
          },
        }),
      );
    }
    await db
      .prepare('UPDATE operations SET complete = TRUE WHERE id = ?')
      .run(input.operationId);
    return {
      id: target.id,
      email: assignment.email,
      verified: Boolean(target.email_confirmed_at),
    };
  }

  app.post('/', async (context) => {
    const token = context.req
      .header('Authorization')
      ?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) throw new ServiceFailure(401);
    let caller;
    try {
      caller = await sdk.auth.getUser(token);
    } catch {
      throw new ServiceFailure(503);
    }
    if (caller.error) {
      if (caller.error.status && caller.error.status >= 500)
        throw new ServiceFailure(503);
      throw new ServiceFailure(401);
    }
    if (
      !caller.data.user ||
      caller.data.user.id !== auxiliarId ||
      !caller.data.user.email_confirmed_at
    )
      throw new ServiceFailure(403);
    if (Date.now() - windowStart > 60_000) {
      windowStart = Date.now();
      attempts = 0;
    }
    const parsed = operationSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!parsed.success)
      return context.json({ error: 'Invalid operation.' }, 422);
    // Read-only migration checks do not consume the mutation quota.
    if (parsed.data.action !== 'inspect' && ++attempts > 30)
      throw new ServiceFailure(429);
    const key = parsed.data.professorId;
    const previous = queues.get(key) ?? Promise.resolve();
    const work = previous.catch(() => {}).then(() => perform(parsed.data));
    queues.set(key, work);
    try {
      return context.json(await work);
    } finally {
      if (queues.get(key) === work) queues.delete(key);
    }
  });
  return app;
}
