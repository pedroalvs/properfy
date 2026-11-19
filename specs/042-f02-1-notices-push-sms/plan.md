# Implementation Plan: Inspector Notices — Backend + Shared (Web Push + SMS fallback)

**Branch**: `042-f02-1-notices-push-sms` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/042-f02-1-notices-push-sms/spec.md` (source task: `fase2-etapa1/tarefas/F02-tarefas.md`, TASK-F02-1)

## Summary

Build the backend domain and shared contracts for *inspector notices*: AM/OP publish a notice (manual) and three subsystems publish *system* notices through a stable internal use case; each published notice materializes a frozen recipient list and is delivered by a pg-boss job that sends Web Push to active device subscriptions and, for **critical** notices with no successful push, an immediate SMS through the existing notification pipeline. Supporting machinery: per-device push subscription storage with `push_enabled` recomputation, a 5-minute safety sweep (recovers lost and half-finished deliveries), a daily platform SMS cost cap, permanent-failure and deactivation revocation, and a daily retention/auto-archive job. Three new platform-scoped tables (no `tenant_id`).

Technical approach: a new Clean-Architecture module `apps/backend/src/modules/inspector-notice/`; a new shared schema file and constants file; the `web-push` library behind an `IPushSender` port (disabled fallback when VAPID is unset); idempotent publish via `pg_advisory_xact_lock` + `getWithHash`/`set` inside one transaction; deterministic UUIDv5 SMS ids for retry-safety; all time math via the existing Sydney timezone helpers.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24
**Primary Dependencies**: Fastify 4, Prisma 6 (PostgreSQL/Supabase, PostGIS in CI), Zod 3, pg-boss 9, jose; **new:** `web-push@^3.6.7` (+ `@types/web-push@^3.6.4` devDep). SMS via existing MobileMessage pipeline; shared contracts via `@properfy/shared` + `openapi-fetch` typing.
**Storage**: PostgreSQL. Three new tables: `inspector_notices`, `inspector_notice_recipients`, `inspector_push_subscriptions`. One cheap data `UPDATE` on existing `inspectors.push_enabled`.
**Testing**: Vitest (unit, shared + backend), Supertest (API integration), testcontainers (real-DB integration suite, serial). No Playwright in backend.
**Target Platform**: Fastify API on Fly.io; jobs via pg-boss workers.
**Project Type**: Monorepo — backend workspace (`apps/backend`) + shared workspace (`packages/shared`). No web/pwa changes in this task.
**Performance Goals**: Delivery batches of 50 recipients, ≤ 10 parallel push sends, per-send timeout 10 s; `expireInMinutes` scaled by recipient count (500 → 22). Sweep caps at 100 notices/run.
**Constraints**: SMS daily cap (default 500, Sydney-day); push TTL 86400 s; `revoked_reason` ≤ 20 chars; endpoint ≤ 2048 chars. No Redis. Expand-only migration.
**Scale/Scope**: Inspector population in the low thousands; notices low volume/day; subscriptions a handful per inspector. ~68 files changed, well under the 150-file PR cap.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Clean Architecture (NON-NEGOTIABLE)** — PASS. New module split into `domain/` (entity, repository ports, errors, audience type, push-sender port), `application/` (use cases + recipient-resolution service), `infrastructure/` (Prisma repositories, `web-push.sender`, `disabled-push.sender`), `interfaces/` (Fastify routes). Dependencies point inward; the SMS send reuses the existing `CreateNotificationUseCase` port; the push sender is a port with two adapters.
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — PASS **with documented deviation** (see Complexity Tracking). The three tables are platform-scoped and carry no `tenant_id` because an inspector is cross-tenant (precedent: `Inspector`, global `ServiceRegion`, `IntegrationSetting`; CLAUDE.md §7 rule 1). Scope is enforced by RBAC (AM/OP across inspectors; INSP pinned to `authContext.inspectorId`) and proven by a §7.1 scoping test that a `CL_*`/`INSP` actor cannot read another subject's rows. The SMS template is `tenantId = null` TRANSACTIONAL, consistent with platform-scoped notifications. Audit rows carry `tenantId: null` (platform action), matching existing platform-scoped audit.
- **III. Test-Driven Development (NON-NEGOTIABLE)** — PASS. Every use case, sender, schema and constant has a red-first test (matrices in the spec/task). Real-DB integration suite covers migration, uniqueness, `push_enabled` recomputation, concurrent idempotency (must fail without the advisory lock), the end-to-end SMS fallback (00.A2), the sweep, the cap, auto-archive and deactivation. No Prisma/Postgres mocking in integration.
- **IV. Contract-First APIs (NON-NEGOTIABLE)** — PASS. Zod schemas live in `packages/shared/src/schemas/inspector-notice.ts`; routes declare `schema.response`; `openapi.json` + `api-types.ts` regenerated via `pnpm generate:api` and committed. Error envelope `{error:{code,message,details}}`; `/v1` prefix; camelCase payloads; `request_id` propagated into jobs and logs. Expand/contract respected (new tables/endpoints only).
- **V. Simplicity and Minimal Impact** — PASS. No feature flags, no speculative abstractions; the push sender port exists because it has two real adapters (enabled/disabled) and must be faked in tests. Existing pipeline reused for SMS rather than a new sender. `NotificationChannel` is **not** extended (D6).

**Result:** PASS. One justified deviation recorded under Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/042-f02-1-notices-push-sms/
├── plan.md              # This file
├── spec.md              # Feature spec (done)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (HTTP + internal use-case contracts)
│   ├── http-endpoints.md
│   └── internal-usecases.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/inspector-notice.ts        # NEW — Zod schemas (+ export in schemas/index.ts)
├── constants/inspector-notices.ts     # NEW — types, criticality, target allowlist, helpers (+ export in constants/index.ts)
├── constants/notification-templates.ts # MODIFY — register INSPECTOR_NOTICE_SMS (6 points, APPEND)
├── api-types.ts                        # REGENERATE (never hand-edit)
└── openapi.json (packages/shared/)     # REGENERATE

apps/backend/
├── prisma/schema.prisma                # MODIFY — 3 models + relations on Inspector, User
├── prisma/migrations/20261030HHMMSS_inspector_notices_push/migration.sql  # NEW (1 migration)
└── src/
    ├── modules/inspector-notice/       # NEW module
    │   ├── domain/
    │   │   ├── inspector-notice.entity.ts
    │   │   ├── inspector-notice.repository.ts        # port
    │   │   ├── push-subscription.repository.ts       # port
    │   │   ├── push-sender.ts                         # IPushSender port + outcome types
    │   │   ├── audience.ts
    │   │   ├── sms-notification-id.ts
    │   │   └── inspector-notice.errors.ts
    │   ├── application/
    │   │   ├── services/resolve-notice-recipients.ts
    │   │   └── use-cases/*.use-case.ts               # publish, archive, list, get, list-my, get-my,
    │   │       mark-read, count-my-unread, upsert-push, unsubscribe-push, get-push-config,
    │   │       deliver, sweep-undelivered, publish-system, has-recent-system, auto-archive
    │   ├── infrastructure/
    │   │   ├── prisma-inspector-notice.repository.ts
    │   │   ├── prisma-push-subscription.repository.ts
    │   │   ├── web-push.sender.ts
    │   │   └── disabled-push.sender.ts
    │   └── interfaces/inspector-notice.routes.ts
    ├── modules/notification/domain/platform-notification-templates.ts  # MODIFY — 1 entry
    ├── modules/notification/domain/notification.repository.ts          # MODIFY — countByTemplateChannelSince (port)
    ├── modules/notification/infrastructure/prisma-notification.repository.ts  # MODIFY — impl
    ├── modules/inspector/.../record-inspector-app-state.use-case.ts    # MODIFY — stop writing push_enabled
    ├── modules/inspector/domain/inspector.repository.ts                # MODIFY — drop pushEnabled arg (L-F01-02)
    ├── modules/inspector/infrastructure/prisma-inspector.repository.ts # MODIFY — drop column from single SQL
    ├── modules/inspector/.../deactivate-inspector.use-case.ts          # MODIFY — revoke subscriptions (L-F02-11)
    └── main/{env.ts, routes.ts, container.ts, workers.ts}              # MODIFY — wiring, env, jobs

apps/backend/tests/
├── unit/inspector-notice/*.test.ts     # NEW directory
├── unit/notification/platform-notification-templates.test.ts  # MODIFY
├── integration/inspector-notice/inspector-notice.routes.test.ts  # NEW
├── integration/rbac/inspector-notice-rbac.test.ts  # NEW
└── integration/db/inspector-notice.integration.test.ts  # NEW (testcontainers)
```

**Structure Decision**: Monorepo, two workspaces touched. A single new backend module `inspector-notice` owns the domain; shared contracts live in `packages/shared`. No web/pwa code. This matches the existing module layout (`appointment`, `notification`, `inspector`, `service-group`).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `inspector_notices`, `inspector_notice_recipients`, `inspector_push_subscriptions` carry **no `tenant_id`** (deviates from Constitution §II "every business entity carries `tenant_id`") | The subject is the **inspector**, who is cross-tenant. A notice, its recipients and a device subscription are not owned by any one agency; attaching a tenant would be meaningless and would mis-scope reads. Precedent: `Inspector`, global `ServiceRegion`, `IntegrationSetting` (CLAUDE.md §7 rule 1 — documented platform-scoped exception). | Adding a nullable `tenant_id` would invite `if (tenantId)` filtering that silently drops scope and would not reflect any real ownership. Scope is instead enforced by RBAC (AM/OP across all inspectors; INSP pinned to its own `inspectorId` from the JWT) and a mandatory §7.1 integration test proving a `CL_*`/`INSP` actor cannot read another subject's rows. |
| `IPushSender` port with two adapters (enabled `WebPushSender`, `DisabledPushSender`) | Push must be faked in unit tests, degrade safely when VAPID is unset, and keep the delivery use case free of `web-push` library types. Two real adapters, not speculative. | A direct `web-push` call in the use case would couple the domain to a library, make the DISABLED/SMS-fallback path untestable, and break the clock/outcome matrix tests. |
