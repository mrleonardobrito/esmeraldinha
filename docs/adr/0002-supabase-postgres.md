# Supabase Postgres behind a controlled data API

Date: 2026-11-18

## Decision

Use Supabase Postgres as the source of truth for application data when `ESMERALDINHA_DATA_API_URL` is configured. Keep React, Playwright, portal sessions, file interpretation, and the existing portal workflows on the desktop. Missing or failed hosted operations never switch to SQLite automatically.

Electron cannot hold a Postgres password or a project administrative key. A separately deployed Node/Hono data API owns a small connection pool and exposes registered domain operations, each with input validation and authorization. It accepts opaque application sessions after the existing Supabase Auth admission flow. A native Supabase JWT, recovery code, or local desktop token alone cannot call these operations.

The desktop exchanges hosted application tokens for its own opaque tokens. Both hosted application tokens and Supabase access/refresh tokens remain outside the renderer. Each protected desktop request rechecks the hosted conta. Logout, idleness, and revocation clean up the local browser contexts.

## Persistence and authorization

The `esmeraldinha` schema contains the conta, professores, turmas, estudantes, cadernetas, boletim, catálogo de códigos CR, and resumable Auth operations. The separate `esmeraldinha_auth_admin` schema contains administrative assignments and operation fingerprints. Dedicated runtime logins have access only to their respective schemas; neither can create objects or bypass RLS.

Both schemas are private and explicitly revoke access from `anon`, `authenticated`, and `service_role`. RLS permits the respective backend role. Per-person ownership, financial-field restrictions, and setup/recovery restrictions are enforced by the controlled API, preserving the single-auxiliar model. These policies do not claim per-person database isolation: direct end-user Data API access is deliberately unavailable.

Stores use asynchronous operations with native transactions on one checked-out connection. UUIDs and foreign keys preserve identity links, timestamps use `timestamptz`, money uses `numeric`, flags use `boolean`, and ciphertext uses `bytea`. The local SQLite implementation remains an explicit development/transition mode.

## Credenciais do professor

CPF and senha do portal remain the professor's ordinary entry contract. The hosted API checks both Supabase authentication and the encrypted portal senha. Portal validation and automation run on the desktop; the verified auxiliar de ensino controls enrollment and credential updates.

The hosted API encrypts senhas with a dedicated AES-256-GCM server key. Existing OS-keychain ciphertext is decrypted on its original desktop and transferred only in memory over HTTPS for re-encryption. It is never treated as portable ciphertext. The renderer does not receive senhas or server keys.

## Migration and recovery

The import reads SQLite without changing it, preserves IDs and relationships, verifies existing Auth assignments through the administrative service, and checks imported row counts. The destination must be empty. An advisory lock and a transaction make failures leave the destination unchanged. A source checksum and keyed payload fingerprint make a lost response safely retryable without overwriting later data.

An existing administrative SQLite journal has a separate import preserving assignments, tombstones, and fingerprints. Its original journal key remains unchanged. Both services run as one instance each; their process-memory app sessions are intentionally invalidated on restart.

After importing the conta ID, affected sessions end and the auxiliar de ensino signs in again. The source backup and keychain remain available for recovery. Restoring an older SQLite file does not undo hosted Auth changes or merge subsequent cloud writes.

## Consequences

Hosted data access requires connectivity and the controlled services. The server can share the host already needed by Auth administration. Weekly portal synchronization still runs on an open desktop and requires an active full auxiliar session; background work does not renew its local idle deadline.

See [Postgres setup and rollout](../supabase-postgres.md) for configuration, import order, validation, and rollback.
