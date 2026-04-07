# Properfy Constitution

## Core Principles

### I. Clean Architecture (NON-NEGOTIABLE)

Every backend module follows Clean Architecture with strict layer dependencies:

- `domain/` — entities, value objects, domain services. Zero external dependencies.
- `application/` — use cases orchestrating domain logic through ports (interfaces).
- `infrastructure/` — adapters implementing ports (Prisma repositories, HTTP clients, queue workers).
- `interfaces/` — delivery mechanisms (Fastify routes, controllers, DTOs).

Dependencies point inward only. Domain never imports application, application never imports infrastructure, and so on. Cross-cutting concerns use dependency injection through ports defined in the inner layer.

### II. Multi-Tenant Safety (NON-NEGOTIABLE)

Tenant isolation is enforced at every layer and can never be bypassed:

- Every business entity carries `tenant_id`.
- JWT tokens include `tenant_id` and `role` claims; auth middleware populates request-scoped context.
- **`AM` is the only role with `tenant_id = null` in the JWT.** `OP`, `CL_ADMIN`, `CL_USER`, and `INSP` (when acting as a user) all carry a `tenant_id`. OP operates within its tenant, not globally.
- Repositories accept and apply tenant scope automatically — never query without it.
- Authorization lives in the application layer (RBAC/ABAC), not in routes or repositories.
- Critical operations (status transitions, financial entries, permission changes) produce audit records.
- Critical commands (acceptance, execution, notifications, financial entries) are idempotent via `Idempotency-Key`.
- Audit events for tenant-scoped actors (OP, CL_ADMIN, CL_USER) must always carry the actor's `tenant_id`.

Any code that queries business data without tenant scope is a bug, regardless of context. **Any code that grants OP cross-tenant access is a bug** — see the correction track at `.specify/memory/correction-op-tenant-scope.md`.

**Service Region tenant scope rule**: `ServiceRegion` is a **per-tenant** entity. Every region belongs to exactly one tenant. Region names may repeat across different tenants; uniqueness applies only within the same tenant. Region-based eligibility (marketplace matching, inspector assignment) must always be resolved inside tenant scope. Inspectors are global/multi-tenant, but region ownership remains tenant-scoped. **Any code that treats ServiceRegion as global is a bug** — see the correction track at `.specify/memory/correction-service-region-scope.md`.

> **CORRECTION (2026-04-06)**: The codebase currently treats `ServiceRegion` as a global entity (no `tenant_id` column). This is a **divergence from the approved dossier**.

### III. Test-Driven Development (NON-NEGOTIABLE)

TDD is mandatory per PR:

- Red → Green → Refactor cycle strictly enforced.
- Unit tests with Vitest; API integration with Supertest; frontend E2E with Playwright.
- Coverage floor: 70% global, 80%+ for critical modules (auth, appointments, finance).
- Integration tests hit a real database — never mock Prisma or Postgres in integration suites.
- CI blocks merges on any test failure; tests cannot be skipped or disabled without replacement.

### IV. Contract-First APIs (NON-NEGOTIABLE)

The API surface is the contract between backend, web, and PWA. **The OpenAPI document generated from Fastify routes is the single source of truth** for the API contract — frontend clients are generated from it, and any divergence between code and OpenAPI is a bug.

- REST, prefix `/v1`, camelCase in payloads, snake_case in database.
- All payloads validated with Zod at the boundary; Zod schemas live in `packages/shared/src/schemas/` and are imported by both backend routes and frontend consumers.
- Shared types, enums, and schemas live in `packages/shared` — never duplicated across workspaces.
- Error envelope: `{ error: { code, message, details? } }`.
- Lists paginate with `page`, `pageSize`, `sortBy`, `sortOrder`.
- `request_id` header mandatory on every request and job; propagated through logs and async queues.
- Contract changes follow expand/contract: add new fields/endpoints first, migrate consumers, then remove old.

### V. Simplicity and Minimal Impact

- The best code is the least code that solves the problem correctly.
- No speculative abstractions, feature flags, or backwards-compat shims for code not yet shipped.
- Change only what the task requires; do not refactor unrelated code in passing.
- Delete dead code — do not comment it out or hide it behind flags.
- Prefer framework-native features over custom implementations.
- No placeholder comments (`// TODO: implement`, `// ...`, truncated output). Complete what you start.

## Technology Stack (Binding)

Any deviation requires explicit amendment of this constitution.

- **Runtime**: Node.js (backend), modern browsers (web), PWA on mobile.
- **Backend**: Fastify, Prisma ORM, PostgreSQL (Supabase), pg-boss for async jobs. No Redis.
- **Frontend**: React + Vite + Tailwind CSS. Design system preserved from legacy Vue 2 + Vuetify 2 identity.
- **Auth**: Internal JWT with RS256 and `kid` rotation. Stateless application layer.
- **Storage**: Supabase Storage (S3-compatible).
- **External services**: Twilio/Zenvia (SMS), Resend (email), Mapbox (geocoding).
- **Package manager**: pnpm workspaces (`apps/backend`, `apps/web`, `apps/pwa`, `packages/shared`).
- **Infra**: `dev` local, `staging` Fly.io (`properfy-staging`), `prod` Fly.io (`properfy`) with rolling deploy and health checks.

## Domain Invariants

### Appointment State Machine (Sovereign)

The appointment state machine is the sovereign source of truth for appointment lifecycle. **No code path may transition an appointment except through the state-machine use case.** Direct database writes to `appointments.status` are forbidden outside migrations.

Official statuses: `DRAFT`, `AWAITING_INSPECTOR` (alias `OPEN`), `SCHEDULED`, `DONE`, `CANCELLED`, `REJECTED`.

Every transition MUST:

1. Be executed through the appointment-transition use case (one function, one entry point).
2. Validate actor role against the transition matrix (see `projeto-consolidado/state-machine-executavel.md` and feature `006-appointments`).
3. Validate tenant scope.
4. Record an audit log entry with actor, timestamp, from/to status, reason (when required), and `request_id`.
5. Require a reason for sensitive transitions (cancellations, rejections, reopens).
6. Emit side effects (notifications, financial entries, queue jobs) through explicit event handlers — never inline in unrelated code.

Reopening a `DONE` appointment is restricted to AM only. `SCHEDULED → REJECTED` requires OP or SYS with reason.

### Financial Rules

- Tenant debit and inspector payout occur when an appointment reaches `DONE`.
- Both entries require operator cross-check (`done_checked_by_user_id`) — the cross-check is a **hard precondition** for writing the financial entries, not a best-effort check.
- Split can vary per service type.
- Cancellation incurs no cost.
- Refunds only when a service was marked done but not actually executed.
- Manual adjustments allowed for AM and OP only, with audit.
- Billing periods configurable per client/inspector: weekly, biweekly, or monthly.

### Audit (Mandatory on Sensitive Actions)

Every sensitive action MUST produce an audit record through the shared `AuditService`. Sensitive actions include, at minimum:

- Authentication events (login, logout, lockout, password change, admin reset, session revocation)
- User and permission mutations (create, update, deactivate, role change)
- Appointment state transitions (all of them)
- Financial entries, adjustments, refunds, manual status changes
- Tenant/branch/inspector activation and deactivation
- Pricing rule changes
- Forced overrides (manual confirmation, cross-tenant actions by AM/OP)

An action without an audit record is a bug, regardless of business outcome.

### RBAC (Binding Role Definitions)

**Internal user roles** (persisted on `users.role`): `AM`, `OP`, `CL_ADMIN`, `CL_USER`, `INSP`.
**Runtime-only actor concepts** (not persisted as user roles): `TNT` (tenant portal, token-authenticated, anonymous), `SYS` (system actor for automated flows).

**Tenant scope rule** (NON-NEGOTIABLE):

- `AM` (Admin Master) — the **only** role with `tenant_id = null`. May act globally across all tenants.
- `OP` (Operator) — **MUST have `tenant_id` set**. Operates as a strong operational admin **within a single tenant**. Cannot list, create, edit, or transition data from other tenants. Think "admin operacional local".
- `CL_ADMIN` (Client Admin) — tenant-scoped. Manages the agency's own team and settings.
- `CL_USER` (Client User) — tenant-scoped. Permissions configurable per feature via tenant settings (APPROVED RULE — not yet fully implemented, see `001#GAP-003`).
- `INSP` (Inspector) — cross-tenant contractor. Auth via User with INSP role; scoped to their own assignments, not to a single tenant. Inspector entity carries `client_eligibility_json` listing which tenants they serve.

> **CORRECTION (2026-04-06)**: The codebase currently treats OP as tenant-free (`tenant_id = null`, cross-tenant access). This is a **divergence from the approved dossier**. A cross-feature correction is tracked in `.specify/memory/correction-op-tenant-scope.md`. All specs and code that grant OP cross-tenant access must be corrected.

**CL user management**: CL_ADMIN can create/manage internal users **only if the agency explicitly enables this capability** in tenant settings. The matrix CL_ADMIN → CL_ADMIN creation is not approved by default — it depends on tenant-level enablement.

**Elevated actions** (AM or OP — OP scoped to own tenant):

- Reopen DONE appointment
- Manual financial status changes and refunds
- Force manual confirmation without tenant response
- Mark SCHEDULED → REJECTED
- Disable client/branch/inspector with open appointments
- Change pricing or split on operational client

**Password policy** (APPROVED RULE):

- Minimum 8 characters, uppercase, lowercase, digit, special character
- Common-password blacklist enforced on every password write path (create, change, admin reset)
- **No forced periodic expiration** — passwords do not expire on a schedule

## Development Workflow

### Branching

- Develop on `staging` branch (or feature branches off `staging`).
- Merge to `main` only when explicitly requested for production release.
- Never push to `main` or touch production infrastructure without explicit user approval.

### Quality Gates

Every PR must pass, in order:

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test` (unit + integration)
4. Prisma migration dry-run
5. Build (all workspaces)

CI blocks merge if any gate fails.

### Migrations

- Prisma migrations are generated alongside the module code that requires them (Supabase starts clean).
- Expand/contract pattern: never destructive in a single deploy.
- Always applied to `staging` before `prod`.

### Commits

- Conventional Commits.
- English only — all code, comments, docs, commit messages, and specs.
- Never reference Claude, AI, or co-author trailers from tools.

### Verification Before Completion

Never claim work is complete without running the relevant verification commands and showing their output. Evidence before assertions, always.

## Knowledge Classification (Critical for AI Agents)

Every assertion in a spec, plan, or task MUST be classifiable into exactly one of three categories. This distinction is binding and must be preserved when specs are read, edited, or consumed by AI agents.

- **IMPLEMENTED REALITY** — behavior currently present in the code on the active branch. Can be verified by reading source files or running tests. When stated in a spec, it must cite the implementing file path or test.
- **APPROVED RULE** — a business rule, contract, or invariant that has been approved for the product and is binding, whether or not the code fulfills it yet. Approved rules are the authoritative target — if code diverges, the code is wrong. Sources: this constitution, `projeto-consolidado/`, explicit user decisions recorded in memory or specs.
- **FUTURE GAP** — something that is NOT yet an approved rule and NOT yet implemented, but is a candidate for a future phase. Gaps are proposals under review and must not be treated as binding until promoted to an approved rule.

Specs and plans MUST label each statement (via section headers, status fields, or inline tags) so a reader can tell which category applies. When an AI agent is asked to implement work, it must target IMPLEMENTED REALITY (to avoid duplication) and APPROVED RULES (to close gaps), and must NOT silently promote FUTURE GAP items into code.

When writing new specs, prefer explicit `Status:` and `Source:` fields over visual markers; prefer dedicated "Known Gaps" sections over mixing gaps into requirements.

## Governance

This constitution supersedes ad-hoc conventions. Where it conflicts with other documents, this file wins — except that explicit user instructions in the active session take precedence over all written guidance.

Amendments require:

1. Updating this file with the new version and amendment date.
2. Updating dependent artifacts (templates, affected feature specs, CLAUDE.md where relevant).
3. A migration note explaining the change and its scope.

All specs, plans, and task breakdowns generated through the spec-kit workflow must link back to this constitution and declare any deviations under an explicit "Complexity Tracking" section.

Runtime guidance for Claude Code lives in `CLAUDE.md` (root and per-workspace). Domain deep-dives live in `projeto-consolidado/`. This constitution is the authoritative summary.

**Version**: 1.2.0 | **Ratified**: 2026-04-05 | **Last Amended**: 2026-04-06

### Amendment Log

- **v1.2.0 (2026-04-06)**: RBAC section rewritten — OP is now explicitly documented as tenant-scoped per the approved dossier. Password policy expanded with "no forced expiration". CL_ADMIN user management conditioned to tenant enablement. Multi-tenant safety section updated. Cross-feature correction track created.
- **v1.1.0 (2026-04-05)**: Added Knowledge Classification, state machine sovereignty, financial cross-check hard precondition, audit mandatory list, OpenAPI as source of truth.
