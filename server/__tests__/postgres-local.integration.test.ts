import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { serve } from '@hono/node-server';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { PostgresDatabase } from '../database/postgres';
import { createAuthAdminApp } from '../auth-admin/app';
import { DevEncryptionAdapter } from '../encryption/dev-encryption-adapter';

vi.mock('../portal-sessions', () => ({
  openSession: vi.fn(async () => ({ id: 'validated-portal' })),
  closeSession: vi.fn(async () => true),
  donoDaSessao: vi.fn(),
  retomarSessao: vi.fn(),
  touchSession: vi.fn(),
  getCatalogo: vi.fn(),
}));

const statusPath = process.env.SUPABASE_POSTGRES_TEST_STATUS_PATH;
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
async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe.skipIf(!statusPath)(
  'isolated native Supabase Postgres integration',
  () => {
    it('imports SQLite atomically, protects data over HTTP, and keeps automation on the desktop', async () => {
      if (
        !basename(dirname(statusPath!)).startsWith(
          'esmeraldinha-postgres-validation-',
        )
      )
        throw new Error(
          'Use a disposable esmeraldinha-postgres-validation-* project.',
        );
      const status = JSON.parse(readFileSync(statusPath!, 'utf8')) as Record<
        string,
        string
      >;
      for (const endpoint of [status.API_URL, status.DB_URL])
        if (new URL(endpoint).hostname !== '127.0.0.1')
          throw new Error('Local integration may only use loopback endpoints.');
      const directory = mkdtempSync(
        join(tmpdir(), 'esmeraldinha-postgres-live-'),
      );
      const admin = new PostgresDatabase({ url: status.DB_URL, max: 2 });
      const sdk = createClient(status.API_URL, status.SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const publicSdk = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const ids = {
        conta: randomUUID(),
        professor: randomUUID(),
        other: randomUUID(),
        turma: randomUUID(),
        caderneta: randomUUID(),
        foreign: randomUUID(),
      };
      const createdUsers: string[] = [];
      let adminJournal: PostgresDatabase | undefined;
      let roleCreated = false;
      let adminRoleCreated = false;
      let child: ReturnType<typeof spawn> | undefined;
      let adminServer: ReturnType<typeof serve> | undefined;
      const sourcePath = join(directory, 'source.db');
      const sourceKey = 'source-local-encryption-key';
      const initialSenha = 'Initial-Supabase-postgres-41!Senha';
      const definitiveSenha = 'Definitive-Supabase-postgres-42!Senha';
      const portalSenha = 'Portal-Supabase-postgres-43!Senha';
      let checksum: string | undefined;
      try {
        expect(
          await admin.prepare('SELECT 1 FROM professores LIMIT 1').get(),
        ).toBeUndefined();
        expect(
          await admin.prepare('SELECT 1 FROM conta LIMIT 1').get(),
        ).toBeUndefined();
        const rolePassword = randomBytes(32).toString('base64url');
        await admin.exec(
          `CREATE ROLE esmeraldinha_api LOGIN INHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '${rolePassword}'`,
        );
        roleCreated = true;
        await admin.exec('GRANT esmeraldinha_runtime TO esmeraldinha_api');
        const adminRolePassword = randomBytes(32).toString('base64url');
        await admin.exec(
          `CREATE ROLE esmeraldinha_auth_admin_api LOGIN INHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '${adminRolePassword}'`,
        );
        adminRoleCreated = true;
        await admin.exec(
          'GRANT esmeraldinha_auth_admin_runtime TO esmeraldinha_auth_admin_api',
        );
        const adminRuntimeUrl = new URL(status.DB_URL);
        adminRuntimeUrl.username = 'esmeraldinha_auth_admin_api';
        adminRuntimeUrl.password = adminRolePassword;
        adminJournal = new PostgresDatabase({
          url: adminRuntimeUrl.toString(),
          schema: 'esmeraldinha_auth_admin',
          max: 2,
        });
        await adminJournal.verifyRuntimeRole(true);
        const runtimeUrl = new URL(status.DB_URL);
        runtimeUrl.username = 'esmeraldinha_api';
        runtimeUrl.password = rolePassword;
        const auxiliarEmail = `auxiliar-${randomUUID()}@example.test`;
        const professorEmail = `professor-${randomUUID()}@example.test`;
        const seed = await sdk.auth.admin.createUser({
          email: auxiliarEmail,
          password: initialSenha,
          email_confirm: true,
        });
        expect(seed.error?.code).toBeUndefined();
        const auxiliarId = seed.data.user!.id;
        createdUsers.push(auxiliarId);
        const adminApp = createAuthAdminApp({
          sdk,
          db: adminJournal,
          auxiliarId,
          journalKey: randomBytes(32).toString('hex'),
          schemaReady: true,
        });
        const adminPort = await unusedPort();
        adminServer = serve({
          fetch: adminApp.fetch,
          hostname: '127.0.0.1',
          port: adminPort,
        });
        const dataPort = await unusedPort();
        child = spawn(process.execPath, ['dist-data-api/index.cjs'], {
          env: {
            ...process.env,
            ESMERALDINHA_DATA_API_URL: '',
            DATABASE_URL: runtimeUrl.toString(),
            ENCRYPTION_ADAPTER: 'server',
            SERVER_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
            DATA_API_PORT: String(dataPort),
            SUPABASE_URL: status.API_URL,
            SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
            SUPABASE_AUXILIAR_AUTH_ID: auxiliarId,
            SUPABASE_AUXILIAR_EMAIL: auxiliarEmail,
            SUPABASE_AUTH_ADMIN_URL: `http://127.0.0.1:${adminPort}/`,
            ESMERALDINHA_LOGIN: 'auxiliar',
          },
          stdio: ['ignore', 'ignore', 'pipe'],
        });
        let startup = '';
        child.stderr?.on('data', (chunk) => {
          startup = (startup + String(chunk)).slice(-3000);
        });
        const dataUrl = `http://127.0.0.1:${dataPort}`;
        let listening = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          if (child.exitCode !== null)
            throw new Error(`Data API exited: ${startup}`);
          try {
            listening = (await fetch(`${dataUrl}/api/health`)).ok;
            if (listening) break;
          } catch {
            /* Wait for the isolated child only. */
          }
          await delay(50);
        }
        expect(listening).toBe(true);
        vi.stubEnv('ESMERALDINHA_DATA_API_URL', dataUrl);
        vi.stubEnv('ESMERALDINHA_DATABASE', 'sqlite');
        vi.stubEnv('ESMERALDINHA_DB_PATH', sourcePath);
        vi.stubEnv('ENCRYPTION_ADAPTER', 'dev');
        vi.stubEnv('ESMERALDINHA_ENCRYPTION_KEY', sourceKey);
        vi.stubEnv('ESMERALDINHA_LOGIN', 'auxiliar');
        vi.resetModules();
        const app = (await import('../app')).createApp();
        const entry = await app.fetch(
          request('/conta/entrar', { login: 'auxiliar', senha: initialSenha }),
        );
        expect(entry.status).toBe(200);
        const setup = (await entry.json()) as { token: string };
        expect(
          (
            await app.fetch(
              request('/professores', undefined, setup.token, 'GET'),
            )
          ).status,
        ).toBe(403);
        const changed = await app.fetch(
          request(
            '/conta/senha',
            { senhaAtual: initialSenha, senha: definitiveSenha },
            setup.token,
            'PUT',
          ),
        );
        expect(changed.status).toBe(200);
        let token = ((await changed.json()) as { token: string }).token;
        const proof = await publicSdk.auth.signInWithPassword({
          email: auxiliarEmail,
          password: definitiveSenha,
        });
        expect(proof.error?.code).toBeUndefined();
        const assignment = await adminApp.fetch(
          new Request('http://localhost/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${proof.data.session!.access_token}`,
            },
            body: JSON.stringify({
              action: 'sync',
              operationId: randomUUID(),
              professorId: ids.professor,
              email: professorEmail,
              senha: portalSenha,
            }),
          }),
        );
        expect(assignment.status).toBe(200);
        const teacherId = ((await assignment.json()) as { id: string }).id;
        createdUsers.push(teacherId);
        expect(
          (
            await sdk.auth.admin.updateUserById(teacherId, {
              email_confirm: true,
            })
          ).error?.code,
        ).toBeUndefined();

        const { SCHEMA } = await import('../professores/db');
        const source = new DatabaseSync(sourcePath);
        source.exec(SCHEMA);
        const encrypted = await new DevEncryptionAdapter(sourceKey).encrypt(
          portalSenha,
        );
        const now = new Date().toISOString();
        source
          .prepare(
            'INSERT INTO conta (id, login, nome, email, created_at, supabase_auth_id, supabase_auth_email, auth_setup_complete) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
          )
          .run(
            ids.conta,
            'auxiliar',
            'Auxiliar Original',
            'contact@example.test',
            now,
            auxiliarId,
            auxiliarEmail,
          );
        for (const [id, cpf, authId, email, enabled, state] of [
          [ids.professor, '52998224725', teacherId, professorEmail, 1, 'ready'],
          [ids.other, '11144477735', null, '', 0, 'unlinked'],
        ] as const) {
          source
            .prepare(
              'INSERT INTO professores (id, nome, login, senha_encrypted, escola, created_at, supabase_auth_id, auth_email, acesso_liberado, auth_sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              id,
              'Professora Original',
              cpf,
              encrypted,
              'Escola Original',
              now,
              authId,
              email,
              enabled,
              state,
            );
        }
        source
          .prepare(
            'INSERT INTO turmas (id, professor_id, nome, created_at) VALUES (?, ?, ?, ?)',
          )
          .run(ids.turma, ids.professor, '1º ANO - A - MATUTINO', now);
        source
          .prepare(
            'INSERT INTO turma_estudantes (turma_id, matricula, nome, ordem) VALUES (?, ?, ?, 0)',
          )
          .run(ids.turma, 'MAT-1', 'Estudante Original');
        for (const [id, professor] of [
          [ids.caderneta, ids.professor],
          [ids.foreign, ids.other],
        ])
          source
            .prepare(
              'INSERT INTO cadernetas (id, professor_id, turma, created_at, valor_recebido, valor_a_receber) VALUES (?, ?, ?, ?, 19.99, 12.34)',
            )
            .run(id, professor, '1º ANO - A - MATUTINO', now);
        source
          .prepare(
            'INSERT INTO caderneta_etapas (caderneta_id, nome, posicao, meses) VALUES (?, ?, 0, ?)',
          )
          .run(ids.caderneta, '1ª Etapa', '["Março"]');
        source
          .prepare(
            'INSERT INTO caderneta_aulas (caderneta_id, etapa, mes, data, ordem, conteudo_preenchido) VALUES (?, ?, ?, ?, 1, 1)',
          )
          .run(ids.caderneta, '1ª Etapa', 'Março', '10/03/2026');
        source
          .prepare(
            'INSERT INTO caderneta_estudantes (caderneta_id, matricula, nome, ordem) VALUES (?, ?, ?, 0)',
          )
          .run(ids.caderneta, 'MAT-1', 'Estudante Original');
        source
          .prepare('INSERT INTO codigos_cr (codigo, texto) VALUES (?, ?)')
          .run(`TEST-${ids.conta}`, 'Habilidade Original');
        source.close();
        const originalFile = createHash('sha256')
          .update(readFileSync(sourcePath))
          .digest('hex');
        const { exportSqlite } = await import('../database/migration');
        const payload = await exportSqlite(
          sourcePath,
          new DevEncryptionAdapter(sourceKey),
        );
        checksum = payload.checksum;
        const journalBefore = await adminJournal
          .prepare('SELECT COUNT(*) AS count FROM operations')
          .get();
        const directEntry = await fetch(`${dataUrl}/api/conta/entrar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login: 'auxiliar', senha: definitiveSenha }),
        });
        const direct = (await directEntry.json()) as {
          token: string;
          conta: { id: string };
        };
        const invalidImport = structuredClone(payload);
        invalidImport.checksum = createHash('sha256')
          .update('deliberately-invalid-import')
          .digest('hex');
        invalidImport.tables.professores[1].auth_revision = 'invalid-integer';
        const refused = await fetch(`${dataUrl}/api/import`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${direct.token}`,
          },
          body: JSON.stringify(invalidImport),
        });
        expect(refused.status).toBe(503);
        expect(
          await admin
            .prepare('SELECT COUNT(*) AS count FROM professores')
            .get(),
        ).toEqual({ count: 0 });
        expect(await admin.prepare('SELECT id FROM conta').get()).toEqual({
          id: direct.conta.id,
        });
        const imported = await app.fetch(
          request('/migration', undefined, token),
        );
        expect(imported.status).toBe(200);
        expect(await imported.json()).toMatchObject({
          counts: { professores: 2, cadernetas: 2, caderneta_aulas: 1 },
          requiresLogin: true,
        });
        expect(
          await adminJournal
            .prepare('SELECT COUNT(*) AS count FROM operations')
            .get(),
        ).toEqual(journalBefore);
        expect(
          createHash('sha256').update(readFileSync(sourcePath)).digest('hex'),
        ).toBe(originalFile);
        expect(
          (await app.fetch(request('/conta', undefined, token, 'GET'))).status,
        ).toBe(401);
        const signed = await app.fetch(
          request('/conta/entrar', {
            login: 'auxiliar',
            senha: definitiveSenha,
          }),
        );
        token = (
          (await signed.json()) as { token: string; conta: { id: string } }
        ).token;
        const profile = (await (
          await app.fetch(request('/conta', undefined, token, 'GET'))
        ).json()) as { id: string; nome: string };
        expect(profile).toMatchObject({
          id: ids.conta,
          nome: 'Auxiliar Original',
        });
        expect(
          (await app.fetch(request('/professores', undefined, token, 'GET')))
            .status,
        ).toBe(200);
        expect(
          (
            await fetch(`${dataUrl}/api/data`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                operation: 'professores.listProfessores',
                args: [],
              }),
            })
          ).status,
        ).toBe(401);
        const rawCipher = (await admin
          .prepare('SELECT senha_encrypted FROM professores WHERE id = ?')
          .get(ids.professor)) as { senha_encrypted: Buffer };
        expect(rawCipher.senha_encrypted.equals(encrypted)).toBe(false);
        expect(rawCipher.senha_encrypted.toString()).not.toContain(portalSenha);
        expect(
          (await app.fetch(request('/migration', undefined, token))).status,
        ).toBe(200);

        const teacherEntry = await app.fetch(
          request('/conta/entrar', {
            login: '529.982.247-25',
            senha: portalSenha,
          }),
        );
        expect(teacherEntry.status).toBe(200);
        const teacherToken = ((await teacherEntry.json()) as { token: string })
          .token;
        const encryptionFactory = vi
          .spyOn(await import('../encryption'), 'createEncryptionPort')
          .mockImplementation(() => {
            throw new Error('No local key is available on this desktop.');
          });
        try {
          expect(
            (
              await app.fetch(
                request(
                  '/cadernetas/sessoes',
                  { professorId: ids.professor },
                  teacherToken,
                ),
              )
            ).status,
          ).toBe(201);
        } finally {
          encryptionFactory.mockRestore();
        }
        const own = await app.fetch(
          request(
            `/cadernetas/${ids.caderneta}`,
            undefined,
            teacherToken,
            'GET',
          ),
        );
        expect(own.status).toBe(200);
        expect(await own.json()).not.toHaveProperty('valorRecebido');
        expect(
          (
            await app.fetch(
              request(
                `/cadernetas/${ids.foreign}`,
                undefined,
                teacherToken,
                'GET',
              ),
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await app.fetch(
              request('/professores', undefined, teacherToken, 'GET'),
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await app.fetch(
              request(
                `/cadernetas/${ids.caderneta}`,
                { valorRecebido: 29.99, valorAReceber: 0 },
                token,
                'PUT',
              ),
            )
          ).status,
        ).toBe(200);
        expect(
          await admin
            .prepare('SELECT valor_recebido FROM cadernetas WHERE id = ?')
            .get(ids.caderneta),
        ).toEqual({ valor_recebido: 29.99 });
        const rpcEntry = await fetch(`${dataUrl}/api/conta/entrar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login: 'auxiliar', senha: definitiveSenha }),
        });
        const rpcToken = ((await rpcEntry.json()) as { token: string }).token;
        const rpc = (operation: string, args: unknown[]) =>
          fetch(`${dataUrl}/api/data`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${rpcToken}`,
            },
            body: JSON.stringify({ operation, args }),
          });
        expect((await rpc('execute_sql', ['SELECT 1'])).status).toBe(400);
        expect(
          (
            await rpc('cadernetas.updateValores', [
              ids.caderneta,
              { valorRecebido: -1, valorAReceber: 0 },
            ])
          ).status,
        ).toBe(422);
        const raspagem = {
          etapas: [
            {
              nome: '1ª Etapa',
              meses: ['Março'],
              aulas: [
                {
                  mes: 'Março',
                  data: '10/03/2026',
                  ordem: 1,
                  preenchida: true,
                },
              ],
              boletins: [
                {
                  disciplina: 'Matemática',
                  avaliacoes: [{ nome: 'AV1', valor: 10 }],
                  notas: [{ matricula: 'MAT-1', avaliacao: 'AV1', valor: 8.5 }],
                  notasDoEstudante: [],
                },
              ],
            },
          ],
          estudantes: [
            { matricula: 'MAT-1', nome: 'Estudante Original', situacao: null },
          ],
        };
        const sync = (value: unknown) =>
          fetch(`${dataUrl}/api/data`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${rpcToken}`,
            },
            body: JSON.stringify({
              operation: 'cadernetas.syncCaderneta',
              args: [ids.caderneta, value],
            }),
          });
        expect((await sync(raspagem)).status).toBe(200);
        const invalidSync = structuredClone(raspagem);
        invalidSync.etapas[0].aulas.push({ ...invalidSync.etapas[0].aulas[0] });
        expect((await sync(invalidSync)).status).toBe(503);
        expect(
          await admin
            .prepare('SELECT valor FROM caderneta_notas WHERE caderneta_id = ?')
            .get(ids.caderneta),
        ).toEqual({ valor: 8.5 });
        expect(
          await admin
            .prepare(
              'SELECT COUNT(*) AS count FROM caderneta_aulas WHERE caderneta_id = ?',
            )
            .get(ids.caderneta),
        ).toEqual({ count: 1 });
        expect(
          (
            await rpc('cadernetas.marcarNotasLancadas', [
              ids.caderneta,
              [],
              [
                {
                  etapa: '1ª Etapa',
                  disciplina: 'Matemática',
                  matricula: 'MAT-1',
                  parcial: 9,
                },
              ],
            ])
          ).status,
        ).toBe(200);
        expect(
          (
            await rpc('cadernetas.marcarNotasLancadas', [
              ids.caderneta,
              [],
              [
                {
                  etapa: '1ª Etapa',
                  disciplina: 'Matemática',
                  matricula: 'MAT-1',
                  parcial: null,
                  personalizada: 8.75,
                },
              ],
            ])
          ).status,
        ).toBe(200);
        expect(
          await admin
            .prepare(
              'SELECT parcial, personalizada FROM caderneta_notas_do_estudante WHERE caderneta_id = ?',
            )
            .get(ids.caderneta),
        ).toEqual({ parcial: 9, personalizada: 8.75 });
        await expect(
          adminJournal.exec('SELECT * FROM esmeraldinha.professores'),
        ).rejects.toMatchObject({ code: '42501' });
        const restricted = new PostgresDatabase({
          url: runtimeUrl.toString(),
          max: 1,
        });
        try {
          await expect(
            restricted.exec(
              'SELECT * FROM esmeraldinha_auth_admin.assignments',
            ),
          ).rejects.toMatchObject({ code: '42501' });
        } finally {
          await restricted.close();
        }
        for (const role of ['anon', 'authenticated', 'service_role'])
          await expect(
            admin.transaction(async () => {
              await admin.exec(`SET LOCAL ROLE ${role}`);
              await admin.exec('SELECT * FROM esmeraldinha.professores');
            }),
          ).rejects.toMatchObject({ code: '42501' });

        if (process.env.SUPABASE_POSTGRES_ELECTRON_SMOKE === '1') {
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
              ESMERALDINHA_DATA_API_URL: dataUrl,
              ESMERALDINHA_DB_PATH: sourcePath,
              ENCRYPTION_ADAPTER: 'dev',
              ESMERALDINHA_ENCRYPTION_KEY: sourceKey,
            },
          });
          try {
            expect(
              await desktop.evaluate(({ app: electronApp }) =>
                electronApp.getPath('userData'),
              ),
            ).toBe(join(directory, 'desktop-profile'));
            const window = await desktop.firstWindow();
            await window
              .getByLabel('Login ou CPF', { exact: true })
              .fill('auxiliar');
            await window
              .getByLabel('Senha', { exact: true })
              .fill(definitiveSenha);
            await window
              .getByRole('button', { name: 'Entrar', exact: true })
              .click();
            await window.waitForURL('app://esmeraldinha/painel');
          } finally {
            await desktop.close();
          }
        }
        expect(
          (
            await app.fetch(
              request(
                `/professores/${ids.professor}/acesso`,
                { liberado: false },
                token,
                'PUT',
              ),
            )
          ).status,
        ).toBe(200);
        expect(
          (await app.fetch(request('/conta', undefined, teacherToken, 'GET')))
            .status,
        ).toBe(401);
        expect(
          (
            await app.fetch(
              request(
                `/professores/${ids.professor}`,
                undefined,
                token,
                'DELETE',
              ),
            )
          ).status,
        ).toBe(204);
        expect(
          await admin
            .prepare('SELECT 1 FROM professores WHERE id = ?')
            .get(ids.professor),
        ).toBeUndefined();
        const repeatedAfterDeletion = await app.fetch(
          request('/migration', undefined, token),
        );
        expect(repeatedAfterDeletion.status).toBe(200);
        expect(await repeatedAfterDeletion.json()).toMatchObject({
          repeated: true,
          requiresLogin: false,
        });
        expect(
          await admin
            .prepare('SELECT 1 FROM professores WHERE id = ?')
            .get(ids.professor),
        ).toBeUndefined();
        child.kill('SIGTERM');
        await new Promise<void>((resolve) =>
          child!.once('exit', () => resolve()),
        );
        expect(
          (await app.fetch(request('/professores', undefined, token, 'GET')))
            .status,
        ).toBe(503);
        expect(
          (await app.fetch(request('/conta/sair', undefined, token))).status,
        ).toBe(204);
        expect(
          createHash('sha256').update(readFileSync(sourcePath)).digest('hex'),
        ).toBe(originalFile);
      } finally {
        await (await import('../conta/sessoes')).encerrarTodasAsSessoes();
        await (await import('../professores/db')).closeDb();
        if (child?.exitCode === null) {
          child.kill('SIGTERM');
          await new Promise<void>((resolve) =>
            child!.once('exit', () => resolve()),
          );
        }
        if (adminServer)
          await new Promise<void>((resolve) =>
            adminServer!.close(() => resolve()),
          );
        await adminJournal?.close();
        await admin
          .prepare(
            'DELETE FROM esmeraldinha_auth_admin.operations WHERE professor_id IN (?, ?)',
          )
          .run(ids.professor, ids.other);
        await admin
          .prepare(
            'DELETE FROM esmeraldinha_auth_admin.assignments WHERE professor_id IN (?, ?)',
          )
          .run(ids.professor, ids.other);
        await admin
          .prepare('DELETE FROM professores WHERE id IN (?, ?)')
          .run(ids.professor, ids.other);
        for (const id of createdUsers)
          await admin
            .prepare('DELETE FROM conta WHERE supabase_auth_id = ?')
            .run(id);
        await admin
          .prepare('DELETE FROM codigos_cr WHERE codigo = ?')
          .run(`TEST-${ids.conta}`);
        if (checksum)
          await admin
            .prepare('DELETE FROM migration_imports WHERE checksum = ?')
            .run(checksum);
        for (const id of createdUsers) await sdk.auth.admin.deleteUser(id);
        if (roleCreated) await admin.exec('DROP ROLE esmeraldinha_api');
        if (adminRoleCreated)
          await admin.exec('DROP ROLE esmeraldinha_auth_admin_api');
        await admin.close();
        vi.unstubAllEnvs();
        rmSync(directory, { recursive: true, force: true });
      }
    }, 90_000);
  },
);
