import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { serve } from '@hono/node-server';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createAuthAdminApp } from '../auth-admin/app';

vi.mock('../portal-sessions', () => ({
  openSession: vi.fn(async () => ({ id: 'portal-validation' })),
  closeSession: vi.fn(async () => true),
  donoDaSessao: vi.fn(),
  retomarSessao: vi.fn(),
  touchSession: vi.fn(),
  getCatalogo: vi.fn(),
}));

const statusPath = process.env.SUPABASE_TEST_STATUS_PATH;
const request = (
  path: string,
  body?: unknown,
  token?: string,
  method = 'POST',
) =>
  new Request(`http://localhost/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe.skipIf(!statusPath)('isolated local Supabase integration', () => {
  it('runs setup, CPF entry, synchronization, recovery, and revocation against GoTrue', async () => {
    const status = JSON.parse(readFileSync(statusPath!, 'utf8')) as Record<
      string,
      string
    >;
    const url = new URL(status.API_URL);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname))
      throw new Error(
        'Integration tests may only use an isolated local Supabase project.',
      );
    const sdk = createClient(status.API_URL, status.SECRET_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const directory = mkdtempSync(join(tmpdir(), 'esmeraldinha-auth-live-'));
    const emails = {
      auxiliar: `auxiliar-${randomUUID()}@example.test`,
      professor: `professor-${randomUUID()}@example.test`,
    };
    const createdIds: string[] = [];
    const seed = await sdk.auth.admin.createUser({
      email: emails.auxiliar,
      password: 'Initial-local-only-38!Senha',
    });
    expect(seed.error?.code).toBeUndefined();
    const auxiliarId = seed.data.user!.id;
    createdIds.push(auxiliarId);
    const adminDb = new DatabaseSync(join(directory, 'admin.db'));
    const adminApp = createAuthAdminApp({
      sdk,
      db: adminDb,
      auxiliarId,
      journalKey: 'local-validation-journal-key-32-characters',
    });
    let adminPort = 0;
    const server = serve(
      { fetch: adminApp.fetch, port: 0, hostname: '127.0.0.1' },
      ({ port }) => {
        adminPort = port;
      },
    );
    if (!adminPort)
      await new Promise<void>((resolve) => server.once('listening', resolve));
    vi.stubEnv('ESMERALDINHA_DB_PATH', join(directory, 'app.db'));
    vi.stubEnv('ESMERALDINHA_LOGIN', 'auxiliar');
    vi.stubEnv('ENCRYPTION_ADAPTER', 'dev');
    vi.stubEnv(
      'ESMERALDINHA_ENCRYPTION_KEY',
      'local-validation-encryption-key',
    );
    vi.resetModules();
    const { createAuthProvider } = await import('../conta/supabase');
    const provider = createAuthProvider({
      url: status.API_URL,
      publishableKey: status.PUBLISHABLE_KEY,
      auxiliarId,
      auxiliarEmail: emails.auxiliar,
      adminUrl: `http://127.0.0.1:${adminPort}/`,
    });
    const current = (await import('../app')).createApp({ auth: provider });
    try {
      expect(
        (
          await current.fetch(
            request('/conta/codigos', { login: 'auxiliar', tipo: 'setup' }),
          )
        ).status,
      ).toBe(200);
      const code = await sdk.auth.admin.generateLink({
        type: 'signup',
        email: emails.auxiliar,
        password: 'Initial-local-only-38!Senha',
      });
      expect(code.error?.code).toBeUndefined();
      const entry = await current.fetch(
        request('/conta/codigos/verificacoes', {
          login: 'auxiliar',
          codigo: code.data.properties!.email_otp,
        }),
      );
      expect(entry.status).toBe(200);
      const setup = (await entry.json()) as { token: string };
      expect(
        (
          await current.fetch(
            request('/professores', undefined, setup.token, 'GET'),
          )
        ).status,
      ).toBe(403);
      const change = await current.fetch(
        request(
          '/conta/senha',
          { senha: 'Definitive-local-only-39!Senha' },
          setup.token,
          'PUT',
        ),
      );
      expect(change.status).toBe(200);
      let auxiliarToken = ((await change.json()) as { token: string }).token;
      expect(auxiliarToken.split('.')).toHaveLength(1);
      expect(
        (await current.fetch(request('/conta', undefined, setup.token, 'GET')))
          .status,
      ).toBe(401);

      const input = {
        nome: 'Professora de Validação',
        login: '52998224725',
        senha: 'Portal-local-only-40!Senha',
        escola: 'Escola de Validação',
        email: emails.professor,
      };
      const created = await current.fetch(
        request('/professores', input, auxiliarToken),
      );
      expect(created.status).toBe(201);
      const professor = (await created.json()) as { id: string };
      const enrollment = await current.fetch(
        request(
          `/professores/${professor.id}/acesso`,
          { liberado: true },
          auxiliarToken,
          'PUT',
        ),
      );
      expect(enrollment.status).toBe(200);
      const enrollmentState = (await enrollment.json()) as {
        authStatus: string;
      };
      const binding = (await (await import('../professores/db'))
        .getDb()
        .prepare('SELECT supabase_auth_id FROM professores WHERE id = ?')
        .get(professor.id)) as { supabase_auth_id: string };
      createdIds.push(binding.supabase_auth_id);
      if (enrollmentState.authStatus === 'verifying') {
        const verification = await sdk.auth.admin.generateLink({
          type: 'signup',
          email: emails.professor,
          password: input.senha,
        });
        expect(verification.error?.code).toBeUndefined();
        expect(
          (
            await current.fetch(
              request(
                `/professores/${professor.id}/auth/verificacoes`,
                { codigo: verification.data.properties!.email_otp },
                auxiliarToken,
              ),
            )
          ).status,
        ).toBe(200);
      }
      const teacherEntry = await current.fetch(
        request('/conta/entrar', {
          login: '529.982.247-25',
          senha: input.senha,
        }),
      );
      if (teacherEntry.status !== 200) {
        const local = await (
          await import('../professores/store')
        ).getProfessorCredenciais(
          (await import('../professores/db')).getDb(),
          (await import('../encryption')).createEncryptionPort(),
          professor.id,
        );
        const probe = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const providerResult = await probe.auth.signInWithPassword({
          email: emails.professor,
          password: input.senha,
        });
        const remoteState = await sdk.auth.admin.getUserById(
          binding.supabase_auth_id,
        );
        const errorBody = (await teacherEntry.clone().json()) as {
          error?: string;
        };
        throw new Error(
          JSON.stringify({
            status: teacherEntry.status,
            error: errorBody.error,
            localSenhaMatches: local?.senha === input.senha,
            providerError: providerResult.error?.code,
            emailVerified: Boolean(remoteState.data.user?.email_confirmed_at),
          }),
        );
      }
      const teacher = (await teacherEntry.json()) as {
        token: string;
        conta: { papel: string };
      };
      expect(teacher.conta.papel).toBe('professor');
      expect(
        (
          await current.fetch(
            request('/professores', undefined, teacher.token, 'GET'),
          )
        ).status,
      ).toBe(403);

      const replacement = {
        ...input,
        senha: 'Replacement-portal-only-41!Senha',
      };
      expect(
        (
          await current.fetch(
            request(
              `/professores/${professor.id}`,
              replacement,
              auxiliarToken,
              'PUT',
            ),
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await current.fetch(
            request('/conta', undefined, teacher.token, 'GET'),
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await current.fetch(
            request('/conta/entrar', {
              login: input.login,
              senha: replacement.senha,
            }),
          )
        ).status,
      ).toBe(200);

      const recoveryCode = await sdk.auth.admin.generateLink({
        type: 'magiclink',
        email: emails.auxiliar,
      });
      expect(recoveryCode.error?.code).toBeUndefined();
      const recovery = await current.fetch(
        request('/conta/codigos/verificacoes', {
          login: 'auxiliar',
          codigo: recoveryCode.data.properties!.email_otp,
        }),
      );
      const recoveryToken = ((await recovery.json()) as { token: string })
        .token;
      expect(
        (
          await current.fetch(
            request('/professores', undefined, recoveryToken, 'GET'),
          )
        ).status,
      ).toBe(403);
      const recovered = await current.fetch(
        request(
          '/conta/senha',
          { senha: 'Recovered-local-only-42!Senha' },
          recoveryToken,
          'PUT',
        ),
      );
      expect(recovered.status).toBe(200);
      auxiliarToken = ((await recovered.json()) as { token: string }).token;
      expect(
        (
          await current.fetch(
            request(
              `/professores/${professor.id}/acesso`,
              { liberado: false },
              auxiliarToken,
              'PUT',
            ),
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await current.fetch(
            request('/conta/entrar', {
              login: input.login,
              senha: replacement.senha,
            }),
          )
        ).status,
      ).toBe(403);

      if (process.env.SUPABASE_ELECTRON_SMOKE === '1') {
        const { _electron } = await import('playwright');
        const executablePath = (await import('electron'))
          .default as unknown as string;
        const desktop = await _electron.launch({
          executablePath,
          args: [
            '.',
            `--user-data-dir=${join(directory, 'desktop-profile')}`,
            '--no-sandbox',
            '--ozone-platform=x11',
          ],
          env: {
            ...process.env,
            VITE_DEV_SERVER_URL: '',
            SUPABASE_URL: status.API_URL,
            SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
            SUPABASE_AUXILIAR_AUTH_ID: auxiliarId,
            SUPABASE_AUXILIAR_EMAIL: emails.auxiliar,
            SUPABASE_AUTH_ADMIN_URL: `http://127.0.0.1:${adminPort}/`,
          },
        });
        try {
          expect(
            await desktop.evaluate(({ app }) => app.getPath('userData')),
          ).toBe(join(directory, 'desktop-profile'));
          const window = await desktop.firstWindow();
          await window
            .getByLabel('Login ou CPF', { exact: true })
            .fill('auxiliar');
          await window
            .getByLabel('Senha', { exact: true })
            .fill('Recovered-local-only-42!Senha');
          await window
            .getByRole('button', { name: 'Entrar', exact: true })
            .click();
          await window.waitForURL('app://esmeraldinha/painel');
          expect(
            await window
              .getByRole('button', { name: 'Entrar', exact: true })
              .count(),
          ).toBe(0);
        } finally {
          await desktop.close();
        }
      }
      expect(
        (await current.fetch(request('/conta/sair', undefined, auxiliarToken)))
          .status,
      ).toBe(204);
      expect(
        (
          await current.fetch(
            request('/conta', undefined, auxiliarToken, 'GET'),
          )
        ).status,
      ).toBe(401);
    } finally {
      await (await import('../conta/sessoes')).encerrarTodasAsSessoes();
      (await import('../professores/db')).closeDb();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      adminDb.close();
      for (const id of createdIds) await sdk.auth.admin.deleteUser(id);
      vi.unstubAllEnvs();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
