# Supabase Auth with local application sessions

Date: 2026-11-18

## Decision

Supabase authenticates the conta do auxiliar de ensino and professores. React continues calling the local Hono API through an opaque app token. Provider tokens stay in process memory. The API verifies the provider JWT and resolves its subject through explicit SQLite identity links before authorizing a request.

The user confirmed that professores continue entering with CPF and senha do portal. Their provider identity uses a real email as an internal mapping. Entry requires provider authentication, agreement with the encrypted portal senha, enabled access, and a completed enrollment. Email confirmation never grants an ordinary professor app session by itself.

The auxiliar de ensino completes primeiro acesso through a confirmation code and a definitive senha. The shared, bundled senha temporária is retired. When linking an installation that already has a definitive local senha, require that local proof once before binding the configured remote identity. Preserve the existing local conta ID and profile.

## Privileged operations

Electron's Node main process is distributed client code and receives only public project configuration. A separately deployed Node/Hono administration process holds the Supabase secret key. Its fixed auxiliar identity is verified through Auth, and its target assignments come from server-controlled data. Matching an email or a client-provided professor ID does not authorize taking over an existing identity.

The administration process uses its own persistent SQLite database for assignments and an operation journal. One process serializes updates for each professor; a stable HMAC key fingerprints retry payloads without storing senhas. Auth metadata marks completed remote writes so a response lost after a successful write can be reconciled without repeating it. This deployment must run as a single instance with persistent storage.

This focused service avoids introducing hosted application schemas during the Auth migration. Application data remains in the existing SQLite database; Postgres migration is a separate step.

## Confirmation and synchronization

Enrollment sends a signup confirmation with `resend`, rather than passwordless signup for an unconfirmed identity. Passwordless confirmation can clear an existing unconfirmed password, which would break the portal-senha contract. Confirmation and recovery email templates must expose their code to the person entering it. See the [Auth implementation](https://github.com/supabase/auth/blob/master/internal/api/magic_link.go) and [email templates](https://supabase.com/docs/guides/local-development/customizing-email-templates).

Pending local operations encrypt their payload through `EncryptionPort`. Entry stays denied until the provider and local state agree. Updates validate the supplied credenciais on the portal, preserve previous encrypted data until the remote write succeeds, and invalidate existing app sessions. A definite provider policy rejection leaves access disabled and permits correcting the supplied data. Transient failures retain the operation for an explicit retry.

## Session guarantees

The API enforces app idleness independently of provider refresh. Sign-out and process exit invalidate the local session. Senha changes rotate the opaque token and invalidate other local sessions. Cleanup releases portal contexts owned by the ended app session while respecting other active owners.

Already-issued provider JWTs can remain valid until expiry, even after remote logout or a senha change. Local invalidation is immediate; global cross-device revocation is not promised. A temporary provider failure is not a reason to authenticate from cached senhas. [Supabase session behavior](https://supabase.com/docs/guides/auth/sessions)

## Consequences

Initial entry and expired-token renewal require connectivity. The administrative service and SMTP must be configured before enrollment in a hosted project. Portal senhas must satisfy the project's Auth password policy; no alternate app senha is invented to work around it.

The local machine owner can modify local code and SQLite. Before migrating application data to Postgres, establish a trusted authorization boundary and RLS policies; do not assume these local checks automatically protect direct Data API access.
