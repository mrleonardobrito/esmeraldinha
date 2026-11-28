# Module boundaries

This directory is the incremental migration destination, not a second backend.

- Import another module through its root `index.ts` only.
- Keep domain rules independent of frameworks and persistence.
- Application code orchestrates domain rules through explicit ports.
- Infrastructure implements ports; presentation adapts HTTP or IPC.
- Keep composition in the executable or a module composition function.
- The existing `identity` module is a working example; existing routes remain the adapters.
- Do not create empty modules or layers. Add them when migrating a real vertical slice.

See [architecture](../../docs/architecture/README.md) and [migration guide](../../docs/architecture/migration.md).
