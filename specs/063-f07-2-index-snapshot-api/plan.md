# Implementation Plan: Reliability Index — Daily Snapshot, Recompute-on-Settings-Change & AM/OP API

**Branch**: `063-f07-2-index-snapshot-api` | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/063-f07-2-index-snapshot-api/spec.md`

## Summary

Persist the F07-1 reliability computation as a dated per-inspector snapshot, serve it to AM/OP, and re-freeze it when the weights change. A platform job (`reliability.compute-snapshots`, 04:15 Sydney) computes one `InspectorReliabilitySnapshot` row per non-deleted inspector in a single pass (`ReliabilityMetricsService.computeAllWith`) inside one interactive transaction guarded by `pg_advisory_xact_lock`, replacing the day's rows atomically, and purging rows older than 400 days plus rows of soft-deleted inspectors. An hourly `reliability.ensure-today` (05:00–12:00) plus a deploy-time backfill cover a missed/failed run and an overdue weight recompute. A subscriber to the F03 `platform_setting.updated.v1` event enqueues a `SETTINGS_CHANGED` recompute 35 s later (covering the 30 s settings cache). Two AM/OP routes (`GET /v1/dashboard/inspector-performance` and `/:inspectorId`) read the latest snapshot, exposing `isStale` and `settingsUpdatedAt`, with `reliability.view` RBAC and a privacy contract (no coordinates, capped failures). A `ReliabilityIndexReader` is exported for F08 with a platform-wide `position`.

**Technical approach**: a new `modules/reliability` application/infrastructure/interfaces layer on top of the existing F07-1 domain + `ReliabilityMetricsService`; one expand-only Prisma migration; shared response schemas + role-matrix action; two pg-boss schedules + a boot backfill; `api-types`/`openapi.json` regenerated in the same PR.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict, ES2022 ESM), Node.js 24
**Primary Dependencies**: Fastify 4, Prisma 6 (PostgreSQL/Supabase; PostGIS in CI), Zod 3, pg-boss 9, `@properfy/shared`; consumes the F07-1 `ReliabilityMetricsService` and the F03 `IPlatformSettingsReader` + `platform_setting.updated.v1` event
**Storage**: PostgreSQL — new table `inspector_reliability_snapshots` (expand-only migration ordered after the F07-1 migration); **no `tenant_id`**; reads `platform_settings`, `inspectors`, and the F07-1 facts (`inspection_executions`, `appointments`, `audit_logs`, `satisfaction_surveys`, `inspector_field_events`, `day_plan_stops`, `service_types`) through the existing readers
**Testing**: Vitest (domain + application unit, fakes), Supertest (`tests/integration/reliability/reliability.routes.test.ts`), testcontainers (`tests/integration/db/reliability-snapshots.db.test.ts`); TZ-dependent suites pin `TZ=America/Los_Angeles`
**Target Platform**: Fly.io backend (2 machines) — the advisory lock serializes concurrent instances
**Project Type**: Monorepo backend module + shared package additions (no web/pwa)
**Performance Goals**: job completes < 15 s for 200 inspectors × 30 services in the test container; a fixed query count independent of inspector count (one inspector's queries + inspectors read + writes)
**Constraints**: transaction `timeout 120_000`/`maxWait 10_000`; recompute delayed 35 s (30 s settings cache + 5 s margin); 400-day retention; Fastify response serialization strips undeclared keys; privacy — no inspector coordinate in any response/log/column
**Scale/Scope**: ~200 inspectors → ~80k rows at the 400-day retention ceiling; ~33 changed files; one PR to `develop`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture (NON-NEGOTIABLE)** — PASS. New `modules/reliability` layers: `domain/` (entity, repository port, `snapshot-window`, `ranking`, `snapshot-retention`, errors), `application/` (4 use cases + 1 subscriber + `reliability-index.reader`), `infrastructure/` (Prisma repository), `interfaces/` (routes). Dependencies point inward; use cases depend on the F07-1 `ReliabilityMetricsService` and the `IPlatformSettingsReader` / `IJobQueue` / repository ports, never on Prisma directly.
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — PASS **with documented exception**. `InspectorReliabilitySnapshot` has **no `tenant_id`**: the subject is the cross-tenant Inspector (precedents: `Inspector`, global `ServiceRegion`, `DayPlan`, `PlatformSetting`, and the F07-1 facts reader). Isolation is by RBAC — the `reliability.view` action admits only AM/OP; CL_ADMIN/CL_USER/INSP/TNT get 403 **before any repository read**, no agency route touches the table, and the row stores no agency name/address/coordinate. The AM/OP cross-tenant read matches the constitution's cross-tenant operational-team model; the exception and its scoping proof (RBAC tests + DB integration test) are recorded in Complexity Tracking. Audit: the only audit this feature writes is `authorization.denied` on a blocked read (via `AuthorizationService.assertRoles`); no business-data mutation audit is added here — the `platform_setting.updated` audit belongs to the F03 use case, unchanged.
- **III. Test-Driven Development (NON-NEGOTIABLE)** — PASS. Red→green→refactor per the test list in `tasks.md`; unit (domain/use-case with fakes), Supertest route integration, and real-DB testcontainers (idempotency, concurrency-fails-without-lock, performance, purge). Integration tests never mock Prisma.
- **IV. Contract-First APIs (NON-NEGOTIABLE)** — PASS. Response + params schemas live in `packages/shared/src/schemas/reliability.ts`; routes validate/serialize against them; `openapi.json` + `api-types.ts` regenerated in the same PR; role-matrix action `reliability.view` added by append.
- **V. Simplicity and Minimal Impact** — PASS. Reuses the F07-1 engine and the F03 event/settings reader as-is (no edit to `update-platform-setting.use-case.ts`, no new event). One migration, one new module, additive shared changes. No kill switch, no `fieldEvents` recompute, no past-date backfill (explicitly out of scope).

**Branching note**: the constitution's Development Workflow still names `staging` as the base branch; the project's current flow (root `CLAUDE.md` §12, this task) targets `develop`. This PR targets `develop` per the active instructions, which take precedence.

**Result**: PASS (one documented exception, tracked below). No unjustified violations.

## Project Structure

### Documentation (this feature)

```text
specs/063-f07-2-index-snapshot-api/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (route + event + job contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/backend/
├── prisma/
│   ├── schema.prisma                         # + model InspectorReliabilitySnapshot, Inspector.reliability_snapshots
│   └── migrations/
│       └── <ts>_inspector_reliability_snapshots/migration.sql   # expand-only, ordered after F07-1
├── src/
│   ├── modules/reliability/
│   │   ├── domain/
│   │   │   ├── reliability-snapshot.entity.ts
│   │   │   ├── reliability-snapshot.repository.ts         # IReliabilitySnapshotRepository (port)
│   │   │   ├── snapshot-window.ts                         # snapshotWindow / snapshotDateFor
│   │   │   ├── ranking.ts                                 # rankSnapshots
│   │   │   ├── snapshot-retention.ts                      # RELIABILITY_SNAPSHOT_RETENTION_DAYS
│   │   │   └── reliability.errors.ts                      # InspectorNotFoundError
│   │   ├── application/
│   │   │   ├── use-cases/
│   │   │   │   ├── compute-reliability-snapshots.use-case.ts
│   │   │   │   ├── ensure-today-snapshot.use-case.ts
│   │   │   │   ├── get-reliability-ranking.use-case.ts
│   │   │   │   └── get-inspector-reliability.use-case.ts
│   │   │   ├── subscribers/
│   │   │   │   └── recompute-reliability-on-settings-change.subscriber.ts
│   │   │   └── reliability-index.reader.ts                # ReliabilityIndexReader (exported for F08)
│   │   └── interfaces/
│   │       └── reliability.routes.ts                      # GET /v1/dashboard/inspector-performance(+/:id)
│   └── main/
│       ├── container.ts                                   # container.reliability.* + subscriber registration
│       ├── routes.ts / app wiring                         # register reliability routes
│       └── workers.ts                                     # 2 schedules + boot backfill + log list
└── tests/
    ├── unit|module tests colocated per the test list
    └── integration/{reliability/reliability.routes.test.ts, db/reliability-snapshots.db.test.ts}

packages/shared/
├── src/schemas/reliability.ts                             # + ranking/detail/params response schemas, reliabilityDetailStatusSchema
├── src/permissions/role-matrix.ts                         # + 'reliability.view': { roles: ['AM','OP'] }
├── src/api-types.ts                                       # regenerated
└── openapi.json (backend)                                 # regenerated
```

**Structure Decision**: Backend Clean-Architecture module `modules/reliability` (new application/infrastructure/interfaces on the existing F07-1 domain) plus additive `packages/shared` schema + role-matrix changes, mirroring the `live-day`, `inspector-notice`, and dashboard modules. No frontend (TASK-F07-3).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `InspectorReliabilitySnapshot` has no `tenant_id` (Constitution §II "every business entity carries `tenant_id`") | The index is per **Inspector**, a cross-tenant subject whose score aggregates services across all agencies; a `tenant_id` would be meaningless and would fragment one inspector's score. Matches the approved D9 decision and the precedent platform-scoped entities (`Inspector`, global `ServiceRegion`, `DayPlan`, `PlatformSetting`, F07-1 facts reader). | Adding a `tenant_id` (e.g., per-agency sub-scores) would change the product (the index is explicitly platform-wide, AM/OP-only, agencies never see it — D4) and break the F08 anonymous-ranking contract (R2 platform-wide position). Isolation is instead guaranteed by the `reliability.view` RBAC gate before any read, no agency route, and a coordinate-free row — proven by the RBAC unit tests and the DB scoping/privacy integration test. |
| Advisory lock (`pg_advisory_xact_lock`) instead of pg-boss `singletonKey` | The recompute-on-save path must never be dropped; `PgBossJobQueue` silently no-ops a `singletonKey` collision with an active job, so a weight save during the daily run would be lost. The lock serializes without dropping. | `singletonKey` is simpler but loses the 03.A1 recompute under contention; a DB session lock does not work behind PgBouncer. The transaction advisory lock is the minimal correct choice (precedent: `provision-admin.ts`). |
