# Properfy – Project-level guidance for Claude Code

This file gives you (Claude Code) high-level guidance about the Properfy system when working from the repository root.

The repository is a **monorepo** composed of:

- `apps/backend/` – Node.js API (Fastify + Clean Architecture + Prisma + pg-boss)
- `apps/web/` – React + TypeScript + Vite + Tailwind CSS SPA (Portal Master Admin, Portal Imobiliaria, Portal Inquilino)
- `apps/pwa/` – React + Vite + Tailwind CSS PWA (Inspector Mobile App)
- `packages/shared/` – Shared schemas, types, enums and contracts (Zod + TypeScript)
- `packages/frontend-standards/` – Shared non-visual frontend standards (`cn()`, CVA conventions, constants, ESLint config) used by web and pwa

When implementing or modifying features, you must respect the **business rules**, **multi-tenant model**, **state machine** and **API contracts** defined here. Workspace-specific details belong in `apps/backend/CLAUDE.md`, `apps/web/CLAUDE.md`, `apps/pwa/CLAUDE.md` and `packages/shared/CLAUDE.md`.

---

## 1. Project overview

**Name:** Properfy
**Type:** Multi-tenant B2B SaaS
**Domain:** Property inspection services

**Main goals:**

- Orchestrate the complete lifecycle of property inspection appointments with traceability, financial control and multi-tenant isolation.
- Connect real estate agencies (clients), operational team (admin/master admin), inspectors (contractors) and tenants (access via unique link).

**Portals:**

1. **Portal Master Admin** (Web) – Platform-wide management
2. **Portal Imobiliaria/Cliente** (Web) – Agency/client operations
3. **Portal Inquilino** (Web, via unique link) – Tenant confirmation/rescheduling
4. **App Inspetor** (PWA Mobile) – Inspector field operations

---

## 2. High-level architecture

**Backend (API):**

- Node.js 24 + Fastify 4
- Clean Architecture (modules: `domain/`, `application/`, `infrastructure/`, `interfaces/`)
- Prisma 6 ORM + PostgreSQL (Supabase as infrastructure)
- pg-boss for async jobs (notifications, imports, finance) — PostgreSQL-backed, no Redis
- Internal JWT authentication (RS256 with `kid` rotation)
- Stateless application

**Frontend (Web + PWA):**

- React + Vite + Tailwind CSS
- Typed API client: `openapi-fetch` typed by the `paths` generated into `packages/shared/src/api-types.ts` from `packages/shared/openapi.json` (`pnpm generate:api`). CI fails when the committed contract is stale (`contract-freshness` job), so regenerate and commit both files whenever a route schema changes.
- Design system evolved from legacy Vue 2 + Vuetify 2 app (preserve visual identity)

**Infrastructure:**

- `dev` – local (`docker-compose.yml`) and the DEV environment deployed from `develop` (Fly app `properfy-api-dev`, region `iad`)
- `staging` – deployed from `staging` (Fly app `properfy-api-staging`, region `syd`)
- `prod` – deployed from `main` (Fly app `properfy-api`, region `syd`), rolling deploy + health check
- Frontends (web + pwa) – Vercel, one project per environment, built in CI (`frontend-deploy.yml`)
- Supabase Storage (S3-compatible) for files
- PgBouncer for connection pooling

**Monorepo tooling:**

- Package manager: `pnpm` 9 (`packageManager: pnpm@9.15.4`), tasks via Turborepo (`turbo run …`)
- Workspace structure: `apps/backend`, `apps/web`, `apps/pwa`, `packages/shared`, `packages/frontend-standards`

---

## 3. Development commands

```bash
# Install all dependencies
pnpm install

# Run backend
pnpm --filter backend dev

# Run web frontend
pnpm --filter web dev

# Run PWA
pnpm --filter pwa dev

# Run all tests
pnpm test

# Lint all
pnpm lint

# Typecheck all
pnpm typecheck

# Build workspace packages consumed from dist (required before web/pwa typecheck, lint, test)
pnpm --filter @properfy/shared build
pnpm --filter @properfy/frontend-standards build

# Generate the Prisma client (required before backend typecheck/tests)
pnpm --filter backend prisma:generate

# Regenerate the OpenAPI spec + typed client after any route schema change (CI checks freshness)
pnpm generate:api

# Backend real-database integration tests (testcontainers; excluded from `pnpm --filter backend test`)
pnpm --filter backend test:integration:db
```

---

## 4. Domain modules

The backend is organized by domain modules:

1. **Identity & Access** – auth, users, roles, sessions, 2FA
2. **Tenants / Imobiliarias / Branches** – agency management with branches
3. **Properties** – property CRUD with geocoding
4. **Appointments** – core entity, state machine driven
5. **Service Groups / Marketplace** – geographic grouping, offer/accept flow
6. **Tenant Confirmation** – portal via unique link (SMS/email)
7. **Inspector Execution** – start/done with geolocation
8. **Notifications** – email/SMS with templates, retry, DLQ
9. **Billing / Ledger** – financial entries, inspector invoices, adjustments
10. **Reports / Export / Audit** – XLSX reports, audit trail

---

## 5. Appointment state machine

Official statuses:

1. `DRAFT` – Created, not yet released
2. `AWAITING_INSPECTOR` – Available for inspector acceptance (alias: `OPEN`)
3. `SCHEDULED` – Accepted by inspector, programmed for execution
4. `DONE` – Inspection executed and finalized
5. `CANCELLED` – Cancelled (reason required)
6. `REJECTED` – Invalid or impossible to execute (reason required)

**Key transitions:**

| From | To | Actor | Reason required | Notes |
|---|---|---|---|---|
| `DRAFT` | `AWAITING_INSPECTOR` | OP, SYS | No | |
| `DRAFT` | `REJECTED` | OP, AM, SYS | Yes | |
| `DRAFT` | `CANCELLED` | OP, CL, AM | Yes | |
| `AWAITING_INSPECTOR` | `SCHEDULED` | SYS, OP, AM | No | |
| `AWAITING_INSPECTOR` | `CANCELLED` | OP, CL, AM, SYS | Yes | System-triggered daily for appointments created more than 45 days ago and still not executed (reason code `EXPIRED`) |
| `AWAITING_INSPECTOR` | `REJECTED` | OP, AM, SYS | Yes | System-triggered when the rental tenant declines in the portal (reason code `TENANT_DECLINED`) or never responds by T-1 (`TENANT_NO_RESPONSE`) |
| `SCHEDULED` | `DONE` | INSP, OP | No | |
| `SCHEDULED` | `CANCELLED` | OP, CL, AM, SYS | Yes | System-triggered daily for appointments created more than 45 days ago and still not executed (reason code `EXPIRED`) |
| `SCHEDULED` | `REJECTED` | OP, AM, SYS | Yes | Same system triggers as `AWAITING_INSPECTOR → REJECTED` |
| `REJECTED` | `DRAFT` | OP, AM | Yes | |
| `REJECTED` | `AWAITING_INSPECTOR` | OP, AM, SYS | Yes | System-triggered when the appointment is added to a service group, or when the rental tenant picks another time in the portal (immediately followed by `→ SCHEDULED`) |
| `REJECTED` | `CANCELLED` | OP, CL, AM | Yes | |
| `CANCELLED` | `DRAFT` | OP, AM | Yes | |
| `DONE` | `DRAFT` | AM only | Yes | |
| `DONE` | `REJECTED` | AM only | Yes | Emits `DONE_REJECTED` for financial compensation |

**Rules:**

- Every transition must register an audit log.
- Sensitive transitions require a reason.
- Every transition must validate tenant scope and actor permissions.

---

## 6. User roles (RBAC)

| Code | Role | Scope |
|---|---|---|
| `AM` | Admin Master | Platform-wide, all tenants |
| `OP` | Operator | Operational team, cross-tenant |
| `CL_ADMIN` | Client Admin | Agency admin, own tenant |
| `CL_USER` | Client User | Agency user, own tenant (configurable permissions) |
| `INSP` | Inspector | Own schedule and assignments |
| `TNT` | Tenant (Inquilino) | Portal access via unique link |

**Critical actions requiring elevated permissions (AM or OP only):**

- Reopen `DONE` appointment
- Manual financial status changes and refunds
- Mark `SCHEDULED -> REJECTED`
- Disable client/branch/inspector with open appointments
- Change pricing or split on operational client

**Agency-scoped actions** (AM/OP platform-wide, `CL_ADMIN` within its own tenant only):

- Force manual confirmation without tenant response (also `CL_USER` holding the `force_confirmation` flag)
- Send / copy the rental tenant portal link, and read the portal activity history

---

## 7. Multi-tenant rules

1. `tenant_id` is mandatory on every agency-owned entity (appointments, properties, contacts, branches, financial entries, attachments, field events, …). **Documented exception — platform-scoped entities** have no `tenant_id` (or a nullable one meaning "platform") because their subject is cross-tenant: `Inspector`, `IntegrationSetting`, global `ServiceRegion`s, platform `NotificationTemplate`s, and the Phase 2 `PlatformSetting`, `DayPlan`, `InspectorNotice`, reliability-index snapshots, goals and rewards. For these, scope is guaranteed by (a) RBAC: only `AM`/`OP` read or write them across inspectors; (b) `INSP` access always filtered by its own `inspectorId`; (c) `CL_*` reach them only (i) read-only, for platform **defaults without a subject** (platform `NotificationTemplate`s, used as the agency's fallback catalog), or (ii) through a projection filtered by the agency's own appointments; never any row about another inspector or another agency; (d) an integration test proving a `CL_*`/`INSP` actor cannot read another subject's rows. Every spec that adds such an entity records this exception and the scoping test.
2. JWT includes `tenant_id` and `role` claims.
3. Middleware extracts auth context per request.
4. Authorization is centralized in the application layer (RBAC/ABAC).
5. Repositories accept the tenant predicate from the caller; tenant-pinned roles (`CL_ADMIN`, `CL_USER`) are always filtered by their own `tenantId`. Cross-tenant roles (`AM`, `OP`, `SYS`) legitimately read without a tenant predicate. Resolve the predicate with `requireTenantScope` / `assertTenantScope` (`apps/backend/src/shared/domain/require-tenant-scope.ts`), never with an `if (tenantId)` that silently drops the filter.
6. Audit for critical operations (status, financial, permissions).
7. Idempotency on critical commands (acceptance, execution, notifications, financial entries).
8. No business query without an explicit scope decision: tenant (pinned roles), `inspectorId` (`INSP`), portal token (`TNT`), or a documented platform-scoped entity (see rule 1).
9. **Inspector GPS coordinates are never exposed to `CL_ADMIN` or `CL_USER`** — not in API responses, exports, the web UI, notifications, nor the audit log. Agency roles see only derived values (distance to the property, accuracy, flags). New audit entries never store the inspector's raw latitude/longitude; legacy entries are masked on read for `CL_*`. Raw inspector coordinates are visible only to `AM`/`OP` (and to the inspector). `GET /v1/audit-logs` masks coordinate keys for `CL_ADMIN` on read (`maskCoordinateKeys`, `apps/backend/src/modules/audit/domain/mask-coordinate-keys.ts`); do not add any new leak, and add a test that fails if a `CL_*` response carries a coordinate key.

---

## 8. Financial rules

1. **Tenant debit** and **inspector payout** happen when appointment reaches `DONE`.
2. Both require cross-check by operator (`done_checked_by_user_id`).
3. Split can vary by service type.
4. Cancellation has no cost.
5. Refund only when service was marked as done but not actually executed.
6. Manual adjustments allowed for AM and OP.
7. Closing/invoicing period: weekly, biweekly or monthly (configurable per client/inspector).

---

## 9. API conventions

- Style: REST
- Prefix: `/v1`
- Success: direct response; paginated lists with `page`, `pageSize`, `sortBy`, `sortOrder`
- Error envelope: `{ error: { code, message, details } }`
- Naming: `camelCase` in application, `snake_case` in database
- Idempotency: `Idempotency-Key` header for critical operations
- `request_id` mandatory on all API requests and jobs
- **Dates and timezones.** Civil dates (`YYYY-MM-DD`) and time windows are wall-clock values in the **agency timezone** (`tenants.timezone`, default `Australia/Sydney` = `PLATFORM_TIMEZONE` in `packages/shared/src/constants/timezone.ts`); instants (`started_at`, ETAs, `created_at`) are UTC ISO strings. Convert only through the shared helpers (`zonedWallTimeToUtc`, `endOfCivilDayInTz` in `packages/shared/src/utils/timezone-date.ts`; `formatCivilDate`/`formatWallTime*` in `utils/format-display-date.ts`; backend `civilDateInTimezone` in `apps/backend/src/shared/domain/timezone-date.ts`); never `new Date('YYYY-MM-DD')`, never the browser timezone for business rules. Platform jobs ("today", cut-offs) run on `PLATFORM_TIMEZONE`. `users.timezone` (AM/OP/INSP only) is a **display** preference, never a business-rule input (except for the `DayPlan` exception below). **Exception: inspector day plans (`DayPlan`) use the inspector's timezone** (`users.timezone ?? PLATFORM_TIMEZONE`) for the plan's civil date, the 19:30 publication and the publication window, because the plan is per inspector and spans agencies; each stop's time window stays in its appointment's agency timezone. Other Phase 2 cross-tenant entities (goals) use the agency timezone of each appointment; every spec states which timezone each date field is in. Tests that depend on the timezone pin `TZ` away from Sydney.

---

## 10. Notification rules

Mandatory notification events:

1. Initial inspection notice (Email)
2. Reminders at 7, 5, 3 days (Email, plus SMS variants)
3. Escalation to Property Manager (Email)
4. SMS alert to tenant (SMS)
5. Confirmation, rescheduling, cancellation (Email)

Templates are configurable per agency (logo, custom text, signature, dynamic variables).

---

## 11. Testing strategy

- **TDD mandatory per PR** (red-green-refactor)
- Unit tests: `Vitest`
- API integration: `Supertest`
- Frontend E2E: `Playwright`. The web suite (`apps/web/tests/e2e`, all API calls stubbed) is a CI gate (`test-web-e2e`). The PWA suite (`apps/pwa/tests/e2e`, all API calls stubbed, Chromium + WebKit) is a CI gate (`test-pwa-e2e`) — hermetic, with a `globalSetup` that requires both workspace `dist/` built; see `apps/pwa/CLAUDE.md` §10.
- Coverage target (not enforced by CI today): `70%` global, `80%+` for critical modules (auth, appointments, finance)
- CI gate (`.github/workflows/ci.yml`, on every PR and push to `develop`, `staging`, `main`): lint + typecheck (all four workspaces), OpenAPI ↔ api-types freshness, unit/integration tests (shared, backend, web, pwa), web E2E, Prisma schema validation, `prisma migrate deploy` twice against a fresh PostGIS database, real-database integration tests (testcontainers), and build. Node 24 only.

---

## 12. CI/CD pipeline

1. **PRs target `develop`.** All CI jobs listed in §11 must be green to merge.
2. **Deploys are per branch and gated on a green CI run of that branch:** `develop` → DEV, `staging` → STAGING, `main` → PROD (backend: `fly-deploy.yml`; web + pwa: `frontend-deploy.yml`). Promotion is a merge `develop → staging → main`. A green `main` also creates the release tag (`release-tag.yml`).
3. Migrations: applied by each Fly app's `release_command` (`prisma migrate deploy`), so they reach DEV (develop) first, then STAGING, then PROD. Pattern: expand/contract.
4. Rollback: rolling deploy with health check in prod (`fly.production.toml`); manual by release/tag.
5. Deploy window: from 09:00 Brazil (23:00 Sydney reference).
6. Secrets: injected by provider (no `.env` in staging/prod).

---

## 13. Conventions for Claude Code

When you (Claude Code) implement or modify code in this project:

1. **Read the relevant workspace CLAUDE.md** before touching workspace code.
2. **Respect the state machine** – transitions, actors and side effects are formally defined.
3. **Maintain multi-tenant safety** – always include `tenant_id` in queries and validate scope.
4. **Follow Clean Architecture** – domain has no dependencies; application orchestrates; infrastructure implements ports.
5. **Use `packages/shared`** for any type, enum or schema shared between workspaces.
6. **Follow Conventional Commits** for commit messages. Never include Claude or AI references in commit messages or trailers.
   - **PR size hard limit: max 150 changed files per PR.** Verify with `git diff --stat origin/develop... | tail -1` before opening; split larger work into stacked PRs (backend → shared → web/pwa or by feature slice).
7. **Validate with Zod** – all API payloads must be validated.
8. **Never skip tests** – TDD is mandatory.
9. **Consult the code and `docs/` for domain detail** – `apps/backend/prisma/schema.prisma` (data model), `apps/backend/src/modules/appointment/domain/appointment-state-machine.ts` (transition rules), `packages/shared/src` (contracts), `docs/` (runbooks, database, deploy). The old consolidated-docs folder is git-ignored and no longer exists; do not cite it.
10. **Phase 2: 1 task = 1 PR = 1 spec.** Each task in `fase2-etapa1/tarefas/<ID>-tarefas.md` (for example `TASK-F03-1`) is the self-contained input for one `speckit.specify` run and ships as exactly one PR targeting `develop`. Do not merge two tasks into one PR or split one task across PRs without updating the task file first. Anything outside a task's minimal scope goes to `fase2-etapa1/estacionamento.md`, not into the spec.
11. **Every PR updates the CLAUDE.md of every workspace it changes**, as a step of that same PR (Phase 2 rule, 2026-10-27): new routes, screens, entities, settings keys, jobs, caches, commands or conventions are reflected in the matching `CLAUDE.md` before the PR is opened. A PR that makes a CLAUDE.md statement false must fix it; a PR that ships something a CLAUDE.md rule marks as "introduced by <task>" / "until <task> merges" removes that transition clause. Reviewers check this like a failing test.

---

## 14. Key documentation references

| Document | Purpose |
|---|---|
| `apps/backend/prisma/schema.prisma` | Data model (entities, enums, relationships) |
| `apps/backend/src/modules/appointment/domain/appointment-state-machine.ts` | Transition rules (actors, reason, done-check) |
| `packages/shared/openapi.json` | API contract (generated; `pnpm generate:api`) |
| `docs/database-schema.md`, `docs/dev-setup.md`, `docs/fly-deploy-guide.md` | Database, local setup, deploy |
| `docs/runbooks/` | Operational runbooks (auth, queue, notifications, deploy, incidents) |
| `Escopo Completo Properfy - CLIENTE.md` | Client-facing scope document (contractual feature list) |
| `escopo-cliente-gap-audit.md` | Item-by-item audit of the client scope vs current implementation |
| `escopo-pendencias-execucao.md` | **Approved backlog** closing the client-scope gaps — items listed there (incl. Kanban board, satisfaction survey, agency status actions) are IN SCOPE and must not be rejected as out-of-scope in future sessions |

---

## 15. External dependencies

1. SMS: MobileMessage (mobilemessage.com.au)
2. Transactional email: Resend
3. Maps and geocoding: Mapbox
4. Database and storage: Supabase (PostgreSQL + S3-compatible storage)
5. Routing: Mapbox Matrix (stop order) + Directions with per-leg `depart_at` (ETAs, geometry); no beta APIs; Google only through the measured exit described in `apps/backend/CLAUDE.md` §10
6. Hosting: Fly.io (API, all environments) and Vercel (web + pwa, all environments)

---

## 16. Workflow orchestration

### Git worktrees (mandatory for every implementation task)

For every task that involves writing or modifying code, you MUST work in an isolated worktree before starting any implementation. This is not optional.

The expected flow is:
1. Create the worktree yourself with the native `EnterWorktree` tool when available (single cheap call, no heavy output). Only fall back to the `superpowers:using-git-worktrees` skill's manual `git worktree add` path if no native tool exists.
2. **Delegate dependency install + baseline sanity check to a subagent on a cheap model** — do not run `pnpm install` or any baseline check yourself in the main loop. Spawn a foreground `Agent` with `model: "haiku"` and an explicit prompt: cd into the absolute worktree path, run `pnpm install`, then `pnpm --filter backend exec prisma generate` (backend tests fail without this — `pnpm install` alone does not run it), `pnpm --filter @properfy/shared build` and `pnpm --filter @properfy/frontend-standards build` (web, pwa and their Vite dev servers resolve both packages only through `dist/`, never source — without these builds typecheck, lint, tests and the Playwright `webServer` fail in a fresh worktree; CI builds both in `.github/actions/setup`), then run `pnpm --filter <affected-workspace(s)> typecheck` and `pnpm --filter <affected-workspace(s)> lint`. **Do not run the full monorepo test suite as a baseline** — `develop` is already CI-gated green on every merge, so a fresh worktree rarely needs the full ~11+ minute test pass just to prove it's clean; typecheck+lint catches drift cheaply. Instruct the subagent to return only a short pass/fail summary (a few lines), never raw install/test logs.
3. Do all implementation work inside that worktree.
4. Run full verification (lint, typecheck, tests scoped to the touched workspace(s)) inside the worktree before opening a PR — this is the real correctness gate and must actually run. If the relevant suite is large (e.g. backend integration tests), prefer running it via a subagent that reports a condensed pass/fail summary back, rather than letting hundreds of lines of test output land directly in the main loop.
5. When work is complete, commit and push the feature branch.
6. Open a PR targeting `develop` — do this unless the user explicitly says not to.

Skip worktrees only for: pure documentation edits, CLAUDE.md updates, or tasks the user explicitly scopes as "quick fix, no PR needed".

**Why delegate setup:** worktree creation is cheap, but `pnpm install` output and especially a full-suite baseline test run are not — routing them through a cheap subagent keeps that stdout out of the primary (expensive) model's token budget entirely, instead of paying for it on every single task before any real work happens.

### Plan mode

- Enter plan mode before any non-trivial task to discuss approach, constraints and risks.
- Draft a step-by-step plan and wait for approval before writing code.
- Update the plan whenever the approach changes mid-task.

### Subagents

- Use subagents to parallelize independent work (research, implementation, testing).
- Each subagent must have a clear, scoped task description with all necessary context.
- Prefer foreground agents when their output is needed before the next step; use background agents for truly independent work.

### Self-improvement

- After completing a task, reflect on what went well and what could improve.
- If you discover a recurring pattern or convention not yet documented, propose adding it to the relevant CLAUDE.md.
- Capture reusable lessons in memory so future conversations benefit.

### Verification

- Never claim work is complete without running verification commands (build, lint, typecheck, tests).
- Show evidence of passing verification before marking a task as done.
- If verification fails, fix the issue and re-verify — do not skip or defer.

### Elegance

- Prefer the simplest solution that fully meets requirements.
- Avoid over-engineering, unnecessary abstractions and speculative generality.
- Code should read naturally — clear names, minimal nesting, obvious flow.

### Autonomous bug fixing

- When a build, lint or test failure occurs during your work, fix it immediately.
- Do not ask for permission to fix errors you introduced — just fix them and re-verify.
- If the fix is non-trivial or touches unrelated code, explain what happened and why.

---

## 17. Task management

### Plan first

- Break complex tasks into discrete, verifiable steps before starting.
- Use the task system to track progress within the current conversation.
- Each step should have clear completion criteria.

### Verify at every step

- Run relevant checks (typecheck, lint, tests) after each meaningful change.
- Do not batch multiple changes and verify only at the end.
- If a step fails verification, fix it before moving to the next step.

### Track progress

- Update task status as you complete each step.
- If you deviate from the plan, update the plan and explain why.
- Surface blockers early — do not silently skip steps.

### Explain decisions

- When making a non-obvious choice, state the alternatives you considered and why you chose this one.
- Keep explanations concise — one or two sentences, not paragraphs.

### Document as you go

- Add inline comments only where the logic is not self-evident.
- Update relevant documentation if your change affects public APIs or conventions.
- Do not add documentation for documentation's sake.
- If your change makes any CLAUDE.md statement false, fix that statement in the same PR (see §13.11).

### Capture lessons

- If you discover something surprising about the codebase, save it to memory.
- If a debugging session reveals a non-obvious cause, note the pattern for future reference.
- Lessons should be specific and actionable, not generic advice.

---

## 18. Core principles

### Simplicity

- The best code is the least code that solves the problem correctly.
- Prefer standard library and framework features over custom implementations.
- Delete dead code — do not comment it out or hide it behind flags.

### No laziness

- Never use placeholder comments like `// TODO: implement`, `// rest of code here` or `// ...`.
- Never truncate output or skip sections — complete every implementation fully.
- If a task is too large for one pass, say so and propose how to split it — do not silently cut corners.

### Minimal impact

- Change only what is necessary to achieve the goal.
- Do not refactor, reformat or reorganize code that is not directly related to the task.
- Preserve existing conventions and patterns — match the style of surrounding code.

## Active Technologies
<!-- Appended by `speckit.plan` (update-agent-context.sh). Keep this list short: the feature PR prunes entries that are no longer true. -->
- TypeScript 5.6 strict, ES2022 ESM; Node.js 24; pnpm 9 + Turborepo
- Backend: Fastify 4, Prisma 6 (PostgreSQL/Supabase, PostGIS in CI), Zod 3, pg-boss 9, jose (RS256 JWT), Resend, MobileMessage, Mapbox
- Web/PWA: React 18, Vite 5, React Router 6, TanStack Query 5, Tailwind 3, mapbox-gl 3, openapi-fetch; PWA adds vite-plugin-pwa (Workbox), react-hook-form, lucide-react
- Tests: Vitest 1, Supertest, testcontainers, Playwright
- F03-1 (`038-f03-1-platform-settings-geofence`): new table `platform_settings`; new nullable/defaulted columns on `inspection_executions` (expand-only), no `tenant_id` on either; `fastify-type-provider-zod`
- X02-1 (`035-x02-permanent-geocoding`): Mapbox Geocoding v5 permanent mode; `properties.lat/lng` (`Decimal(10,7)`) mirrored to `coordinates GEOMETRY(Point,4326)`; branch coordinates in `branches.address_json`
- F01-1 (`039-f01-1-inspector-base-heartbeat`): `inspectors` gains `base_lat`/`base_lng` (`Decimal(10,7)`), `base_geocoded_at`, `app_installed_at`/`app_last_seen_at`, `push_enabled`, `app_version` (all nullable, expand-only, no `tenant_id`); reuses the X02 geocoding port + `geocodeWithTimeout`/`formatGeocodingQuery`/`isSameGeocodingAddress`; `inspector.base_changed` event; per-user rate limit on `/me/app-state` + `PATCH /me`
- F01-2 (`040-f01-2-inspector-base-web`): web-only consumer of the F01-1 contract — inspector list App/Push/Last-seen columns + "No base address" badge/filter (`missingBaseAddress`), and detail "Base Address"/"App Adoption" sections; Sydney-pinned last-seen formatting in `apps/web/src/features/inspectors/lib/adoption-format.ts`; no backend/schema/api-types change, drawer untouched (F01-1 owns it)
- F01-3 (`041-f01-3-inspector-base-app`): PWA side of F01 — base-address card + `BaseAddressBanner` (2 variants), `useAppStateHeartbeat` (6 h/device throttle via `localStorage` key `properfy.pwa.appStateHeartbeat`), reserved push-preference slot + version footer (`__APP_VERSION__` = `buildAppVersion(pkg.version, APP_BUILD_SHA)`), and `POST /v1/inspectors/me/app-state` + `GET /v1/inspectors/me` added to PWA E2E `BASELINE_STUBS`; consumes TASK-F01-1 contracts only, no backend/schema/api-types change
- F02-1 (`042-f02-1-notices-push-sms`): backend `inspector-notice` module — 3 platform-scoped tables (`inspector_notices`, `inspector_notice_recipients`, `inspector_push_subscriptions`, **no `tenant_id`**, expand-only); AM/OP publish + archive + list/detail, INSP box + mark-read + unread-count, Web Push subscribe/unsubscribe/config (`web-push@^3.6.7`, VAPID env, `DisabledPushSender` fallback); delivery job with critical-only SMS fallback (platform template `INSPECTOR_NOTICE_SMS`, TRANSACTIONAL), 5-min safety sweep, daily SMS cap (`INSPECTOR_NOTICE_SMS_DAILY_CAP`) + auto-archive (`INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS`); internal `PublishSystemInspectorNoticeUseCase`/`HasRecentSystemInspectorNoticeUseCase` for F03/F04/F08; `inspectors.push_enabled` redefined to "has active subscription" (heartbeat no longer writes it); deactivation revokes push
- X02-2 (`044-x02-2-legacy-regeocode`): backend one-off CLI `apps/backend/src/scripts/regeocode-permanent.ts` (`tsx`, dry-run default) — re-geocodes legacy properties/branches in permanent mode, restores false-`MANUAL` rows via the `property.updated` audit, strips temporary coords from committed import `preview_json`, bulk-resumes account-blocked rows; new script-scoped port `ILegacyRegeocodeRepository` on `PrismaPropertyRepository` (CAS on `updated_at`, PostGIS-consistent, `LEGACY_PERMANENT_NO_RESULT` code); no schema/route/api-types change; runbook `docs/runbooks/regeocode-permanent.md`
- F02-2 (`045-f02-2-notices-op-screen`): web AM/OP side of F02 — `features/inspector-notices/` consuming the F02-1 contract (no backend/api-types change); routes `/inspector-notices` + `/inspector-notices/:noticeId` behind `AuthGuard roles={[AM, OP]}`; Sidebar "Dashboard" child "Inspector notices" (between Overview and Analytics, X01 order); controlled New-notice drawer validated against `publishInspectorNoticeSchema` with a stable `Idempotency-Key`, critical `ConfirmDialog` SMS-ceiling + Sydney night-window phrase + lock-screen hint, archive-only (D4); detail read receipts with "Inactive"/"No app access" chips + "(Z can't read in the app)" (L-F02-09); F01-2 "Push" tooltip copy changed to D10 subscription wording; all civil instants in `PLATFORM_TIMEZONE`
- F02-3 (`046-f02-3-sw-push-inbox`): PWA side of F02 — service worker swapped from Workbox `generateSW` to `injectManifest` (`src/sw.ts`) for `push`/`notificationclick`/`pushsubscriptionchange`; per-device push control in `/profile/settings`, Announcements inbox under `/profile` with unread badge (Profile tab + tile), subscription resync on load/VAPID-rotation, logout unsubscribe; new devDeps `workbox-core/precaching/routing/strategies/expiration/cacheable-response` (`^7.4.0`); consumes TASK-F02-1 INSP routes only, no backend/schema/api-types change
- F03-2 (`043-f03-2-field-events`): new table `inspector_field_events` (`CANT_DO`/`LATE_NOTICE`; carries the appointment's `tenant_id`) + `inspection_executions.abandoned_at` (expand-only, one migration ordered after F02); INSP routes `POST /v1/inspector/appointments/:id/cant-do` (→ `SCHEDULED → REJECTED` as SYS with `INSPECTOR_UNABLE`, `SYSTEM_ONLY_REJECTION_CODES`) and `.../late-notice` (server-computed `estimatedArrivalAt`); `GET /v1/appointments/:id/field-activity` (CL never sees inspector lat/lng); `inspectorIssue` (list/detail, one `DISTINCT ON`/page) + `lastFieldIssue` (inspector detail); OP/AM `INSPECTOR_UNABLE_ALERT`; portal no-reoffer for `INSPECTOR_UNABLE`; status transition gains generic `auditMetadata` + `expectedStatus` CAS; `inspector_field_event.recorded.v1`
- F03-3 (`047-f03-3-checkin-card-actions`): PWA side of F03 — Check in/Check out on the schedule card (2 taps, phase from local `useLocalExecutionState`, not a server field), `features/field-events/` with "Can't do this job"/"Running late" sheets (online-only, `apiPost` never the offline queue), shared `useExecutionActions` (single IndexedDB `ExecutionState` writer for card + `ExecutionPage`), `GeoLocationCapture` radius from the detail `geofence` (default 300, warn-only), permanent queued-START cleanup (`isPermanentQueueError`, clears state + chained FINISH + `emitExecutionStateChange`), `purgeAppointmentFromOfflineQueue` after cant-do, "You reported…" detail alert from `lastFieldIssue`; start/finish bodies gain `accuracy`+`clientOccurredAt`; consumes TASK-F03-1/F03-2 contracts only, no backend/schema/api-types change
- F03-4 (`048-f03-4-execution-block-web`): web-only consumer of the F03-1/F03-2 contract (no backend/schema/api-types change) — appointment-detail "Field activity" block (`useAppointmentFieldActivity`, CL coordinate cut) + reusable `InspectorIssueCard` (detail + map compact); `AuditTimeline` geofence/field-event labels + "Initiated by inspector"/"Check-out" badges (shared `TRANSITION_SOURCE_*`); `StatusTransitionDialog` filters `SYSTEM_ONLY_REJECTION_CODES`; new `features/platform-settings/` (`/platform-settings` AM/OP, generic `usePlatformSetting(key)`, `FieldEventsSettingsSection`) + Sidebar "Configuration" child "Platform Settings"; `PortalPage` hides change-time when `canChangeTime === false` (L-F03-01), `useJoinGroupFlow` reloads on 409 `PORTAL_APPOINTMENT_INACTIVE`
- F09-1 (`049-f09-1-density-api`): backend + shared `GET /v1/map/execution-density` — check-in density aggregated into a fixed ~100 m grid (`FLOOR(coord * 1000)`) **inside Postgres**; **tenant-scoped via the `appointments.tenant_id` join** (not a platform-scoped inspector entity: `inspection_executions` has no `tenant_id`), new role-matrix key `map.execution_density`; privacy-by-construction (port returns only `{latIndex,lngIndex,count}`+totals, cell **center** never mean, response-schema strips extra keys), k-anonymity for CL (`MIN_CELL_COUNT_CL=3`, `MIN_CELL_COUNT_GLOBAL=1`, chosen by scope type) + CL locked to 7/30/90-day presets ending today-Sydney (`isExecutionDensityPreset`, residual window-diff risk accepted); `inspectorId` AM/OP-only (CL→403); measures check-ins not completed services (counts `DONE→REJECTED` + reopened); reads `abandoned_at` (F03-2), no schema/migration; shared constants + `api-types` regen; web layer is TASK-F09-2
- F09-2 (`050-f09-2-density-map-layer`): web consumer of the F09-1 contract — opt-in "Activity density" heatmap on `/map` (Appointments mode only) with its own period selector (default last 30 Sydney days, `Custom` AM/OP-only; CL locked to 7/30/90-day presets + re-anchor-once on `PERIOD_NOT_A_PRESET`); generic `DensityLayer` primitive (`components/map/`, comma-HSL ramp, `beforeId`/`styledata` below `gl-draw-*`, re-apply on `style.load`, no camera move), `useExecutionDensity` hook (empty-state on error, no stale leak), `execution-density-period` lib (agrees with shared `isExecutionDensityPreset`), `ExecutionDensityControl` (numbered relative legend, scope line, privacy text from response `minCellCount`); `AppointmentMapPage.tsx` wiring ≤ ~12 lines; no backend/schema/api-types change, no dashboard touched
- F04-1 (`051-f04-1-routing-optimizer`): backend + shared routing engine (dark; TASK-F04-2 consumes) — `ServiceType.default_duration_minutes` (NOT NULL, 5–480, `DEFAULT 45`, idempotent backfill reading `abandoned_at`); pure I/O-free optimizer in `packages/shared/src/route-planning/` (exact ≤ 8 stops, nearest-feasible + 2-opt above, forward slack, deterministic); `IRoutingService` port + Mapbox adapter (Matrix for order, Directions v5 per-leg `depart_at`) + haversine stub + `DynamicRoutingService`; Postgres-backed shared Mapbox rate limiter `routing_rate_limit_buckets` (**no `tenant_id`**, atomic token bucket across 2 Fly machines) + kill switch `DAY_PLAN_ROUTING_PROVIDER=mapbox|stub` + `routingProviderFailuresByCode` metric; `PlanRouteService` orchestrator (interactive stub fallback vs. strict job-mode `RoutingDeferredError`); removes the N5 "created by F04" clause
- F04-2 (`052-f04-2-day-plan-publish`): backend + shared day-plan lifecycle (consumes F04-1) — `DayPlan`/`DayPlanStop` (**no `tenant_id`**, D10 exception; 4 enums; 2 expand-only migrations incl. `inspectors.onboarding_completed_at`); content-**fingerprint** staleness (`computeDayPlanFingerprint`, check-out/DONE-of-started don't recompute, L-F04-01; `classifyStops` both Prisma-free, exported for F05, L-F04-16); 19:30-local singleton pg-boss `day-plan.publish` gated on the per-agency T-1 `hasClaim` (`TenantCronTick` untouched), sequential + 25-min budget + continuation, defer-not-approximate (attempts 1–2) then strict:false (attempt 3); frozen `published_*` ETA for the accuracy metric (L-F04-15); INSP APIs (`/v1/inspector/day-plans/*`: get/order/recalculate/origin/sheet) + AM/OP APIs (`/v1/day-plans/*`: get/recalculate/sheet/preview/eta-accuracy); `origin.source LAST_STOP`+422 `DAY_PLAN_ALREADY_STARTED` after first check-in (L-F04-07); `ROUTE_PUBLISHED`/`ROUTE_CHANGED` (F02, lock-screen-safe, `ROUTE_CHANGED` effective-change + 10-min dedupe, L-F04-06); PDF/XLSX route sheet (L-F04-10); `routeWeights` platform setting + preview; daily route-data purge; `getFreshStopForAppointment` (F06); `MarkDayPlansStaleSubscriber` (incl. `BASE_CHANGED`, R-F01-03); `routingInput` + stored geometry/matrix/leg (Plan A, L-F04-03, Mapbox Order = go-live prereq); `/today` stays out of `INSPECTOR_NOTICE_TARGET_PATTERNS` until Part B; `api-types` regen
- F04-3 (`053-f04-3-pwa-day-screen`): PWA home for the day plan (consumes F04-2 read-only; no backend/schema/api-types change beyond the shared `/today` allowlist entry + the two route-notice `targetPath` wirings) — bottom bar → **Today/Schedule/Offers/More** (More = existing `/profile` hub, URLs unchanged, badge moves to More); `/today` (`TodayLayout`+`TodayPage`) and `/today/route[/:date]` (`RoutePage`) with per-day base (`OriginRow`/`OriginSheet`), stop card (`StopCard` + role-aware `CallContactLink`, L-F04-08), `NavigateButton`/`buildNavigationUrl` (Apple/Google) reused by `PropertyAddressSection`, PDF/XLSX sheet download; new `formatInstantTime` + `/today` in `INSPECTOR_NOTICE_TARGET_PATTERNS` (exact static, F02 D24) + `targetPath:'/today'` on `ROUTE_PUBLISHED`/`ROUTE_CHANGED` (DB7); offline via `api-day-plan-cache` (NetworkFirst, 3 entries, 12 h, 200-only, logout-cleared — carries tenant contact PII); `AppointmentActionBar`/`BaseAddressFields` extracted and reused; day-plan query invalidated by check-in/out, cant-do, offline-queue sync and the SW `inspector-notice:received` message; map + reorder deferred to F04-4
- F04-2b (`071-f04-2b-preview-route-weights`): backend remediation closing the orphaned F04-2 preview contract — `POST /v1/day-plans/preview` (AM/OP, 10/min, `PreviewRouteWeightsUseCase`) computes `current` (saved platform `routeWeights`) vs `proposed` (request weights) variants over **one shared travel matrix** (`PlanRouteService.previewWeights`: 1 Matrix/0 Directions, matrix-only ETAs + forward slack, `etaSource 'MATRIX'`), persisting nothing; date today..today+14 in the actor's effective tz → `422 DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` before routing (L-F04-14); RBAC in the use case (`day_plan.preview_weights`, not a role-matrix key); platform-scoped (no `tenant_id`, role-only isolation test); consumes the already-merged shared schemas, `api-types` regen; no schema/migration. Unblocks F04-5
- F04-4 (`054-f04-4-route-map-reorder`): PWA route map + reorder (consumes F04-1/2/3 read-only; **no backend/schema/api-types/migration change**) — generalized map toolkit moved from `features/offers/` to `apps/pwa/src/lib/map/` (`useMapboxInstance`, points-based `useMapCamera`, `makeNumberedMarkerEl` variants, `colors`, `useGeoJsonLineLayer` solid+dashed, `MapStatusOverlay`, `bounds`), offers consume it with no behavior change; `/today/route` gains a `Segmented` List/Map tab (`?view=map`, lazy `mapbox-gl`), `RouteMapView` with numbered pins + origin (no marker for `NONE`/`LAST_STOP`, L-F04-07; collision offsets for coincident pins, L-F04-13) + real Directions line (dirty draft hides it); reorder (`@dnd-kit` drag + arrows) recomputes **locally** via `reorder-draft.ts` reusing `evaluateSequence`/`RouteOrderMismatchError` from the new **`@properfy/shared/route-planning` subpath** (2nd tsup entry + `exports`, keeps the optimizer out of the eager bundle — entry chunk unchanged, route-planning in the lazy Route chunk) + `toOptimizerInput`/`buildLegOverrides` from the barrel; "+N min vs. suggested", local "~" ETAs, window warnings that never block Save (DB3); `useReorderDraft` derives the reorderable set live (NOT_STARTED incl. this-device check-ins), freezes a dirty draft on a newer version, discards on set change, blocks Save while STALE/offline; `ReorderSaveBar` `PUT …/order` with version-conflict/mismatch/past/429/network handling; "Reset to suggested" local-or-`POST …/recalculate`; new dep `@dnd-kit/{core@6.3.1,sortable@10.0.0,modifiers@9.0.0,utilities@3.2.2}`. Reorder draft is client-only React state (never persisted except via `PUT …/order`; no `localStorage`).
- F04-5 (`056-f04-5-service-type-duration-weights`): shared + backend + web consumer closing the F04 web chain — shared `createServiceTypeSchema.defaultDurationMinutes` becomes **required** (drops the transitional `.default(45)`; `updateServiceTypeSchema` stays optional), `api-types` regen, so `POST /v1/service-types` now 400s without it (backend route test `details[].field='defaultDurationMinutes'`, DB keeps `DEFAULT 45` for direct inserts); web `ServiceTypeFormDrawer` gains a required "Estimated duration (min)" field (`NumberInput` + `aria-describedby` passthrough) validated/sent as a number, with server field-error mapping; **Platform settings** gains a "Route planning" section (`RouteWeightsSettingsSection`, `usePlatformSetting('routeWeights')`) + before-save `RouteWeightsPreview` (`POST /v1/day-plans/preview`, two-column saved-vs-form with order-change flag, approximate/late chips, 429/422 handling) using a feature-local searchable `InspectorSelect`/`useInspectorSearch` (`?status=ACTIVE&search&pageSize=20`, never 100) + effective-tz `DateInput` (today..today+14, default tomorrow); no new backend endpoint/entity/migration. **Premise:** the merged preview response carries no origin field, so the "No base address" banner is out of scope
- F04-3b (`055-f04-3b-app-tour`): PWA app tour — the final F04 link (consumes TASK-F04-2 read-only; **no backend/schema/api-types/migration change, no new dependency**). Self-contained coach-mark engine in `apps/pwa/src/features/tour/` (box-shadow spotlight, anchored balloon, custom focus trap, `inert` `#root`, reduced-motion, absent-target skip; `tour-geometry`/`tour-steps`/`focus-trap`/`tour-pending-storage` pure + `useTargetRect`/`useAppTourController`), mounted by `AppTourHost` in `PwaLayout`. Opens once on first `/today` visit when `onboardingCompletedAt == null`, records via the F01 heartbeat (`onboardingCompleted: true`, pending-retry in `localStorage` `properfy.pwa.tourCompletedPending`, logout-cleared); "Show app tour" in App settings replays without recording. 8 target + 1 install step (9 browser / 8 standalone, L-F04-12); `data-tour` anchors on `BottomNavBar`/`NextInspectionCard`/`AppointmentActionBar`/`TodayHeader`. 00.A1 proven by `tests/e2e/app-tour.spec.ts` E1–E6 (phone projects only); E2E baseline gains a prefix day-plan stub + `standalone.ts` helper
- F04 Plan B (`072-f04-planb-no-routing-cache`): backend + shared — **no Mapbox routing result is persisted** (Mapbox ToS; L-F04-03 resolved as Plan B, 2026-11-02). `compute-day-plan`/`prisma-day-plan.repository` stop writing `route_geometry`/`routing_matrix_json`/`leg_travel_json` (columns stay nullable/unused, **no migration** — dropped in PR-C); the `day-plan.purge-route-data` 03:45 job + use-case are removed (a transitional one-shot `ClearStoredRouteDataUseCase` nulls any Plan-A results already stored, then the deployed cron is unscheduled). `geometry` **and** `routingInput` are recomputed **on demand** into the same response fields via `recomputeRoutingForRecord` / `ComputeDayPlanUseCase.routingFor` (pure `PlanRouteService.compute`, PRESERVE_ORDER, interactive+non-strict → stub on rate-limit, never persists): INSP GET gets geometry+matrix+legs, AM/OP GET geometry only (routingInput null). New INSP `POST /v1/inspector/day-plans/:date/order/preview` (`PreviewDayPlanOrderUseCase` + `PlanRouteService.previewOrder`, `etaSource 'MATRIX'`, 30/min, persists nothing); `PUT /order`/recalculate/origin recompute the Matrix on demand (REORDER no longer reuses `cachedMatrix`). `api-types` regen (non-breaking: geometry/routingInput retained). **PR-A** of a strict A→B→C rollout — PR-B (PWA switches reorder to the preview endpoint, stops reading `routingInput`) is Bússola's; PR-C then removes `routingInput`/`dayPlanRoutingInputSchema`/`toOptimizerInput`/`buildLegOverrides` and drops the columns. Supersedes F04-2's Plan-A storage+purge clause.
- F04 Plan B PR-B (`073-f04-planb-pwa-reorder`): PWA-only — the route reorder evaluates **on the server** instead of locally (Mapbox ToS; consumes PR-A's endpoint, **no backend/shared/api-types/migration change**). `useReorderPreview` calls `POST /v1/inspector/day-plans/:date/order/preview` (`usePreviewDayPlanOrder`, debounced 400 ms, `keepPreviousData`, version+order-keyed) for the draft order and the aligned suggested order (cached per version, skipped when equal) to derive "+N min vs. suggested" from two `etaSource 'MATRIX'` finishes; `reorder-draft.ts` drops `routingInput`/`evaluateSequence`/`toOptimizerInput`/`buildLegOverrides` (now pure order/set helpers only; `canReorder` = ≥ 2 not-started stops), evaluation/formatting move to `reorder-preview.ts`. A 200 `approximate` preview (server degraded to the stub) still shows the numbers but flags them "estimates" like the GET banner; graceful degrade (offline / 429 / provider error / 422 `DAY_PLAN_ALREADY_STARTED`) with no fabricated numbers and Save rules unchanged; two-step a11y announcement (position now, finish/delta on resolve). Map still reads `plan.geometry` (untouched); the optimizer no longer ships to the client. PR-C (Pillar) later removes `routingInput` from the contract.
- F04 Plan B PR-C (`074-f04-planb-remove-routing-input`): backend + shared **contract** phase (closes A→B→C). Removes `routingInput` from `dayPlanResponseSchema` + `dayPlanRoutingInputSchema`/`toOptimizerInput`/`buildLegOverrides` (dead after PR-B), **drops the 4 dead columns** `route_geometry`/`routing_matrix_json`/`leg_travel_json`/`geometry_purged_at` (migration `20261107000000_drop_day_plan_route_columns`), and removes the PR-A transitional cleanup (`ClearStoredRouteDataUseCase` + `boss.unschedule`). **GET is now Directions-only** — `resolveMatrix` gains `forceProviderMatrix`; PRESERVE_ORDER (the GET geometry recompute) skips the provider Matrix (stub-seeded timeline + per-leg Directions), while `previewOrder` passes `forceProviderMatrix:true` to keep `etaSource 'MATRIX'`. Resolves the preview↔`PUT /order` asymmetry (spec-clear, D18 / F04-tarefas.md line 725/726): **preview now serves a started day**, reordering the not-started tail from the effective `LAST_STOP` origin — `DAY_PLAN_ALREADY_STARTED` is origin-endpoints-only. `api-types` regen (breaking removal of `routingInput`, but no consumer reads it); PWA **test fixtures** that still set `routingInput` cleaned (no PWA runtime change). `plan.geometry` still on demand (PWA map unaffected).

## Recent Changes
- X03 (`036-x03-pwa-e2e-recovery`): PWA Playwright E2E suite recovered and wired into CI (`test-pwa-e2e`, Chromium + WebKit, hermetic); harness in `apps/pwa/tests/e2e/support/`
- Phase 2 Stage 1 planning (`fase2-etapa1/`): CLAUDE.md refreshed (X00); every feature PR updates the CLAUDE.md of the workspace it changes
