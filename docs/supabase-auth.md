# Supabase Auth setup

The desktop app uses Supabase Auth while keeping application data and encrypted credenciais do professor in SQLite. A separate administration process handles privileged Auth operations. No application table is migrated to hosted Postgres in this phase.

## Configure the project

1. Enable email authentication and confirmations. Disable public creation of new identities; the app enrolls known identities through the controlled administration flow.
2. Configure custom SMTP for real recipients. Supabase's default sender only reaches project-team addresses and is severely rate-limited. [SMTP configuration](https://supabase.com/docs/guides/auth/auth-smtp)
3. In **Authentication → Email Templates**, include a clearly visible `{{ .Token }}` in both **Confirm signup** and **Magic Link** templates. The app accepts a typed code instead of an external browser callback. Signup confirmation serves primeiro acesso and professor enrollment; Magic Link serves recovery for an already confirmed auxiliar identity. [Template configuration](https://supabase.com/docs/guides/local-development/customizing-email-templates)
4. Choose a password policy compatible with the supplied portal senhas. Supabase's supported minimum is six characters, while the earlier local cadastro accepted four. A shorter or otherwise incompatible senha can remain stored for portal automation by the auxiliar de ensino, but professor app access cannot be enabled unchanged. Coordinate any portal senha update with the professor; do not create a separate Esmeraldinha senha. The [CLI Auth configuration reference](https://supabase.com/docs/guides/local-development/cli/config#auth.minimum_password_length) describes the supported minimum.

## Provision the conta do auxiliar de ensino

On a controlled machine, copy `server/auth-admin/.env.example` to `server/auth-admin/.env`. Set the project URL, a modern secret key, and the intended `SUPABASE_AUXILIAR_EMAIL`.

```bash
pnpm provision:auxiliar
```

This creates an unconfirmed identity with a random initial senha that is never printed or distributed. The command prints only the public `SUPABASE_AUXILIAR_AUTH_ID`. Set that UUID in both the administration environment and the desktop's public configuration. An existing email is not reassigned automatically; inspect the expected identity in the dashboard instead of retrying provisioning blindly.

The app's **Primeiro acesso do auxiliar** action sends a confirmation code. After verification, only senha setup is available. **Recuperar senha do auxiliar** sends a code for an already confirmed identity and again restricts the app until a new senha is set.

For an installation with an existing local definitive senha, entry also requires **Senha anterior desta instalação** once. Binding preserves the local conta ID and profile, then removes the local password hash. Normal authentication afterward uses Supabase.

## Run the administration service

Complete `server/auth-admin/.env` with:

| Setting | Purpose |
| --- | --- |
| `SUPABASE_URL` | Project endpoint |
| `SUPABASE_SECRET_KEY` | Privileged project key, restricted to this controlled server |
| `SUPABASE_AUXILIAR_AUTH_ID` | Exact identity allowed to administer professores |
| `AUTH_ADMIN_JOURNAL_KEY` | Stable random value of at least 32 characters |
| `AUTH_ADMIN_DB_PATH` | Persistent assignments and operation journal; default `./data/auth-admin.db` |
| `AUTH_ADMIN_PORT` | Local listener; default `3002` |

```bash
pnpm build:auth-admin
pnpm start:auth-admin
```

Use `pnpm dev:auth-admin` during development. The service binds to `127.0.0.1`; deploy it behind an HTTPS reverse proxy. Run one instance with persistent storage and keep a backup of its database and stable journal key. Disable proxy request-body logging on this endpoint. It processes senhas transiently and stores no recoverable cloud copy of them.

The service uses its own SQLite database containing only Auth assignments and operation fingerprints. It does not receive the desktop database, profile images, or caderneta data. Preserve that separation when deploying it.

## Configure the desktop

Before updating an existing installation, close the app and back up its SQLite database. Keep the original OS keychain available for the encrypted credenciais do professor. Existing professores retain their local IDs and cadernetas, but must complete Auth enrollment before their app access works again.

Set these public values in the root `.env` or `server/.env` during development:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_AUXILIAR_AUTH_ID=<the expected Auth UUID>
SUPABASE_AUXILIAR_EMAIL=<the expected email>
SUPABASE_AUTH_ADMIN_URL=https://your-controlled-service.example/
ESMERALDINHA_LOGIN=auxiliar
```

Only a modern publishable key is accepted. An incomplete configuration fails closed; there is no fallback to a shared local senha. Continue using the existing OS keychain in Electron and the development encryption key only in development.

For installed builds, set the `SUPABASE_*` values above as GitHub Actions repository **Variables** before packaging. `ESMERALDINHA_LOGIN` remains the optional alias configured by the existing build environment. `electron/build-defines.mjs` embeds only public configuration and rejects a secret supplied as the publishable key. No Auth administrative secret belongs in desktop configuration or CI build defines.

## Enroll professores

1. Create or edit the local professor and supply a real email for confirmation. The ordinary entry screen still accepts CPF and senha do portal.
2. Choose **Criar acesso ao sistema**. The server validates the stored credenciais on the portal and asks the administration service to create/link the assigned identity and synchronize its senha.
3. Confirm the code delivered to the professor's email. The API verifies that it belongs to that exact identity and immediately ends the temporary provider session. Email confirmation alone does not issue an app token for the professor.
4. The professor can now enter with CPF and the synchronized portal senha. The API checks enabled access and ownership of each requested caderneta and sessão do portal.

A confirmation retry uses **Reenviar código**. A transient synchronization failure uses **Retomar sincronização do acesso**. Its pending payload is encrypted on the original desktop, and retries retain the same operation ID. Revoking access denies local app sessions immediately, even if the remote service is unavailable.

Updates to linked credenciais run through the same synchronization flow. A direct password change in Supabase cannot create an independent Esmeraldinha senha: entry must still match the encrypted portal senha. If the professor changes the senha directly on the portal, supply the current credenciais through the auxiliar de ensino's protected edit flow. The app does not log into the portal on every app entry or change portal senhas automatically.

The backing email of an already linked professor is currently immutable through the ordinary edit form. A new installation must preserve existing local IDs when reusing remote assignments; matching a mailbox is deliberately insufficient to take over an identity.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm build:electron
pnpm build:auth-admin
```

Routine tests inject a deterministic provider; SDK tests verify signed JWTs, refresh coordination, and failure handling. The optional integration test accepts the JSON status file of an isolated local Supabase stack:

```bash
SUPABASE_TEST_STATUS_PATH=/path/to/local-status.json pnpm exec vitest run server/__tests__/supabase-local.integration.test.ts
```

It refuses non-loopback projects and creates/deletes only its disposable test identities. It uses the real Auth service and administration HTTP boundary; portal validation is mocked. After building the desktop, set `SUPABASE_ELECTRON_SMOKE=1` to also exercise the compiled `app://` login. On a headless Linux runner, use `xvfb-run -a`.

Provider tokens live only in the API/main process. Native JWT revocation can take until token expiry; app logout invalidates its opaque token immediately. Initial entry and expired-token renewal require connectivity. Configure and verify the hosted project and SMTP separately before distributing an installer to professores and the auxiliar de ensino.
