# Esmeraldinha — development instructions

## Product and sources

Esmeraldinha is an operational and pedagogical assistance application for managing cadernetas in the portal do professor of Limoeiro de Anadia. It serves two actors: the auxiliar de ensino, who manages professores and works on their behalf, and the professor, who can purchase direct access and manage their own cadernetas.

Read [CONTEXT.md](CONTEXT.md) for the ubiquitous language, business rules and portal labels. The business source is [Esmeraldinha — Funcionamento do Negócio e Regras Operacionais (v2)](https://docs.google.com/document/d/1Uh3mdCZv9Hao_g8_5AJusjtZJLtlKK-d). The portal is the only legally authoritative record. Architecture proposals do not silently override product requirements.

Before changing architecture, read [architecture](docs/architecture/README.md), [migration guide](docs/architecture/migration.md) and, for identity/access work, [authentication migration](docs/architecture/authentication-migration.md). Distinguish existing behavior from proposed migration behavior.

## Non-negotiable business rules

- The auxiliar de ensino manages only professores and cadernetas under their management. A professor with direct access manages only their own cadernetas; a paid plano is an entitlement, not a papel de acesso. No public self-enrollment into the core.
- Application identity is separate from the credenciais do professor, which remain for the portal only. The auxiliar de ensino provides a conta do professor with a senha temporária sent to the professor's e-mail; the local conta do auxiliar de ensino starts with a senha temporária from the environment. Every senha temporária must be replaced in the primeiro acesso before any other application screen opens. After it, a professor sees only their own cadernetas, turmas and estudantes. The sessão da aplicação and sessão do portal expire after inactivity and are distinct.
- Discover turmas, estudantes and aulas from the portal during professor cadastro. Select the correct período letivo before every portal operation. Preserve the full turma name for integration and use the nome curto da turma only for display.
- A caderneta covers one regente turma or one to four turmas de redução for the same professor. Automatically group existing and new turmas de redução, preserving existing groups where possible and filling vacancies in stable cadastro order. Never merge the estudantes or aulas of different turmas. The grupo diário is a professor–turma relationship, not a global professor attribute.
- Completion requires all mandatory information in conteúdo, frequência, ficha de desempenho, ficha descritiva and boletim across every relevant aula/estudante and all four etapas. The mês is a display filter, not an independent completion unit.
- Read the áreas de conhecimento and habilidades from the portal. Conceitos are ordered NR < RD < R and cannot regress between etapas. Estudantes not mentioned with difficulties receive R in selected áreas, subject to the non-regression invariant.
- Identify notas by matrícula, disciplina and avaliação within the correct turma and etapa. Never write nota parcial or nota calculada pelas avaliações. Apply the documented classificação bands and distribute in 0.5 increments; remember exceptions across etapas and disciplinas. Portal values prevail over local assumptions.
- Both actors can use chat de conteúdos and chat de notas within their authorized scope. Accept supported text, image and PDF inputs where specified. AI produces proposals, never direct portal writes. The operator reviews and saves in the portal. Verify conteúdo in a fresh sessão do portal; remove only verified rascunhos and preserve pending ones.

## Engineering approach

Current implementation target: four users, one management installation. Prefer the simplest implementation that preserves security, business invariants and the ability to change infrastructure. Apply Clean Architecture, DDD and SOLID selectively; no mandatory abstraction for every operation.

- Keep React, Electron, Hono, TypeScript and existing infrastructure unless a concrete requirement justifies replacing them. Use a modular monolith, plain functions or small services, and direct calls. Do not create empty modules, event buses, queues, generic units of work or distributed systems for hypothetical scale.
- Organize new or migrated backend slices under server/modules. A module owns its domain rules and exposes a public index.ts. Do not import another module's internal stores. Domain and application remain independent of Hono, Electron, SQLite, Supabase and Playwright.
- The core owns internal identity, authentication workflows, papel de acesso, access status and authorization data. Local/SQLite and Supabase are separate infrastructure adapters implementing the same application-owned async ports. Select the adapter bundle in composition only; no imports between adapters, silent fallback or automatic dual writes.
- Follow the small-installation authentication guide: two initial identity ports, one remote core-owned user table, shared memory sessions and manual reconciliation when necessary. These are target decisions, not implemented facts. Add organizations before onboarding a second independent management customer.
- Keep domain terms in Portuguese in prose, identifiers and filenames; all other prose and technical names are English. New Supabase physical schema, persisted enum values and adapter DTOs are English; map them to the existing core vocabulary.
- Protect credentials, tokens, CPF and estudante data. Never copy portal senha into Supabase Auth, expose privileged keys in Electron, or authorize via user-editable metadata. Enforce server-side resource ownership, active access and session revocation; scope nested references and lists. Professor responses must not expose auxiliary financial values or other professores' credentials. A remote login alone does not give secure access to the auxiliary's local SQLite.

## Incremental migration and validation

For each change, identify the business rule, characterize existing behavior with tests, extract only necessary ports/policies, wire the new slice through existing routes, and remove legacy compatibility code only after all callers migrate. Preserve endpoint paths, DTOs, IDs, stored data and portal behavior unless an intentional product change is approved.

Run pnpm typecheck, pnpm lint and pnpm test before merge; use targeted Vitest and relevant Playwright/Electron smoke checks when appropriate. Test both infrastructure adapters against the same contracts, including denied access, suspended sessions and cross-professor requests. Keep architecture tests enforcing module boundaries. Document unverified behavior, regressions and migration/rollback requirements; never claim a test was run if it was not.

## Agent workflow

- Issues and specs: .scratch/<feature>/; use docs/agents/issue-tracker.md and docs/agents/triage-labels.md when present.
- Domain documentation: single CONTEXT.md plus docs/adr/. Use docs/agents/domain.md when present.
- Record material business decisions in CONTEXT.md or the requirements source, and architectural decisions in docs/adr/ or the relevant architecture guide. Do not turn an implementation suggestion into a business invariant without approval.
