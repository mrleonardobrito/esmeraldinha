# ADR 0001: Incremental modular monolith

Status: accepted for this architecture draft; deployment changes require separate decisions.

## Context

The existing desktop application uses Hono, React, SQLite and Playwright. Identity, authorization, portal integration and caderneta routes have cross-cutting dependencies. A rewrite or premature service split increases regression risk.

## Decision

Use a modular monolith, vertical slices and selective Ports and Adapters. Start with an integrated identity module in server/modules. Preserve existing HTTP and storage contracts, use legacy adapters during migration, and enforce new module boundaries through tests. Retain Portuguese domain vocabulary from CONTEXT.md. Keep deployment unchanged until remote access has an independently reviewed threat model.

## Alternatives considered

- Big-bang rewrite: rejected due to regression and migration cost.
- Microservices now: rejected due to distributed consistency and operational complexity.
- Folder-only reorganization: rejected because it does not establish enforceable dependencies.
- Mandatory full DDD for all modules: rejected; simple functionality should remain simple.

## Consequences

New modules expose explicit public APIs. Legacy coupling is allowed temporarily only through documented adapters. Security and migration defects must be addressed in separate, testable changes. Future cloud deployment can reuse the same domain rules, but it does not make local data trusted or remove the need for tenant isolation.
