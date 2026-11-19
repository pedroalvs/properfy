# Implementation Plan: Day Plan — Persistence, 19:30 Publication, APIs, Route Sheet, Weights, Metric & Purge

**Branch**: `052-f04-2-day-plan-publish` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/052-f04-2-day-plan-publish/spec.md`; source task TASK-F04-2 in `fase2-etapa1/tarefas/F04-tarefas.md`.

## Summary

Persist a per-inspector, per-day route plan (`DayPlan` + ordered `DayPlanStop`, **no `tenant_id`**) built from the F04-1 optimizer and Mapbox routing; auto-publish the next day's plan at 19:30 in the inspector's timezone via a singleton pg-boss job gated on the per-agency T-1 claim, freezing published ETAs and sending a critical `ROUTE_PUBLISHED` notice (F02). Reads recompute an input **fingerprint** so unchanged plans are returned without a provider call and no-change STALE flags are cleared for free (L-F04-01). Expose inspector APIs (view, reorder not-started stops, recalculate, set/clear day origin, download sheet) and AM/OP APIs (view, recalculate with `ROUTE_CHANGED`, export, weights preview, ETA-accuracy metric), a PDF/XLSX route sheet, a `routeWeights` platform setting, a daily route-data purge, the `getFreshStopForAppointment` reader for F06, and the `onboarding_completed_at` heartbeat slice for the F04-3b tour. L-F04-03 resolved = Plan A (store geometry/matrix/leg durations, forward `routingInput`) backed by a Mapbox commercial Order (go-live prerequisite).

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24 (CI); pnpm 9 + Turborepo.
**Primary Dependencies**: Fastify 4, Prisma 6 (PostgreSQL/Supabase, PostGIS in CI), Zod 3, pg-boss 9, `fastify-type-provider-zod`, ExcelJS (XLSX), pdfkit (PDF), F04-1 `PlanRouteService`/`IRoutingService`/optimizer/`PostgresRoutingRateLimiter`, F02 `PublishSystemInspectorNoticeUseCase`, F03 `IPlatformSettingsReader`, X02 `geocodeWithTimeout`/`formatGeocodingQuery` (permanent mode).
**Storage**: PostgreSQL. New tables `day_plans`, `day_plan_stops` (no `tenant_id`); new column `inspectors.onboarding_completed_at`. Two expand-only migrations.
**Testing**: Vitest (unit + domain), Supertest (route integration under `apps/backend/tests/integration/day-plan/`), testcontainers (db suite, serial), backend full suite required (unit + integration + integration-db).
**Target Platform**: Linux server (Fly.io API, all environments); workers run in the API process (`ENABLE_JOB_QUEUE`), 2 machines in prod.
**Project Type**: Web service (backend) + shared contracts package. No web/pwa UI in this task (Part B / F05 consume the contracts); only `api-types.ts` is regenerated.
**Performance Goals**: Publish ≤ 30 inspectors/batch within a 25-min budget; Matrix < 100k elements/month, Directions < 100k req/month (estimate 16.5k / 6.6k). Per-route rate limits (GET 60/120/min, order 30/min, recalc 6/min, origin 10/min, sheet 20/min, preview 10/min).
**Constraints**: No `tenant_id` on the plan (D10 exception); `TenantCronTick` unchanged (only `hasClaim` added); no inspector coordinates or Mapbox token in any response/log/audit/sheet; single migration per PR; PR < 150 files (estimate ~105).
**Scale/Scope**: Backend module `modules/day-plan` (~13 use cases, domain functions, subscriber, 2 repositories, sheet renderer, routes), shared enums/constants/schemas, 2 workers, container wiring, ~30 test files. Esteio (pair) owns sheet + metric/purge + onboarding + limits + effective-origin rendering.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture (NON-NEGOTIABLE)** — PASS. `domain/` (entity, fingerprint, classify-stops, primary-contact, publication-window, errors — zero external deps, Prisma-free per L-F04-16), `application/` (use cases + subscriber + notices text, orchestrating through `IDayPlanRepository`/`IDayPlanInputReader`/`IRoutingService`/`IPlatformSettingsReader` ports), `infrastructure/` (Prisma repos, sheet renderer, cron-run repo method), `interfaces/` (Fastify routes). Dependencies point inward only.
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — PASS **with a documented deviation** (see Complexity Tracking). `DayPlan`/`DayPlanStop` carry no `tenant_id` (D10), with constitutional precedent in `Inspector` and global `ServiceRegion`. Isolation is enforced at the application layer: RBAC role check first, INSP filtered to own `inspectorId` (others → 404), stops re-joined to live appointments with the status filter (L-F04-04), AM/OP cross-tenant by platform role, audits `tenantId: null` (CL audit log is tenant-scoped). A scoping test proves a CL_*/INSP actor cannot read another subject's plan. Inspector raw coordinates are never exposed to CL/agency roles (not applicable here — CL has no access at all) and never stored in audits.
- **III. Test-Driven Development (NON-NEGOTIABLE)** — PASS. Red→green→refactor; unit (domain/use cases with in-memory repos), Supertest route integration, testcontainers db suite (serial). Full backend suite is the correctness gate. TZ-dependent tests pin `TZ` away from Sydney.
- **IV. Contract-First APIs (NON-NEGOTIABLE)** — PASS. All request/response schemas in `packages/shared/src/schemas/day-plan.ts` (Zod), imported by routes; `api-types.ts` regenerated via `pnpm generate:api`; error envelope `{ error: { code, message, details } }`; `/v1` prefix, camelCase payloads; `request_id` propagated; expand-only migrations.
- **V. Simplicity and Minimal Impact** — PASS. No speculative abstractions; `TenantCronTick` untouched; the `routeWeights` setting only appends to the registry; no dead code; complete implementation (no placeholders).
- **Audit (mandatory on sensitive actions)** — PASS. `day_plan.published/exported/recalculated/reordered/origin_overridden/origin_override_cleared` audited; open-time compute, STALE marking and purge log only (volume, documented).
- **Appointment State Machine (Sovereign)** — PASS. This task **never writes `appointments.status`**; it only reads appointments and reacts to `APPOINTMENT_EVENTS.STATUS_TRANSITION` via a subscriber.

**Result: PASS** (one justified deviation recorded under Complexity Tracking). No NEEDS CLARIFICATION remain (L-F04-03 resolved in Clarifications).

## Project Structure

### Documentation (this feature)

```text
specs/052-f04-2-day-plan-publish/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (day-plan.openapi.md)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── enums/day-plan.ts                       # DayPlanStatus, DayPlanComputeTrigger, DayPlanOriginSource, DayPlanOriginWarning, RoutingProvider
├── constants/day-plan.ts                   # publish time/hour/minute, ETA-accuracy thresholds, max stops
├── schemas/day-plan.ts                     # request/response schemas + toOptimizerInput + buildLegOverrides
├── schemas/platform-settings.ts            # append routeWeights entry (section "Route planning")
└── schemas/inspector.ts                    # inspectorAppStateSchema.onboardingCompleted, inspectorResponseSchema.onboardingCompletedAt

apps/backend/prisma/
├── schema.prisma                           # DayPlan, DayPlanStop, 4 enums, inverse relations, inspectors.onboarding_completed_at
└── migrations/
    ├── <ts>_day_plans/migration.sql        # expand: enums + 2 tables + FKs + indexes
    └── <ts>_inspector_onboarding_completed_at/migration.sql

apps/backend/src/modules/day-plan/
├── domain/                                 # day-plan.entity.ts, day-plan.repository.ts (IDayPlanRepository),
│                                           # day-plan-input.reader.ts (IDayPlanInputReader), day-plan-fingerprint.ts,
│                                           # classify-stops.ts, primary-contact.ts, publication-window.ts, day-plan.errors.ts
├── application/
│   ├── use-cases/                          # compute, get-my, get-for-operator, save-order, recalculate,
│   │                                       # set-origin, clear-origin, publish, purge-route-data, get-sheet,
│   │                                       # preview-route-weights, get-route-eta-accuracy, get-fresh-stop-for-appointment
│   ├── subscribers/mark-day-plans-stale.subscriber.ts
│   └── day-plan-notices.ts                 # ROUTE_PUBLISHED / ROUTE_CHANGED title+body
├── infrastructure/                         # prisma-day-plan.repository.ts, prisma-day-plan-input.reader.ts, day-plan-sheet.renderer.ts
└── interfaces/day-plan.routes.ts           # /v1/inspector/day-plans/* (INSP), /v1/day-plans/* (AM/OP)

apps/backend/src/
├── main/workers.ts                         # day-plan.publish ('30 * * * *'), day-plan.purge-route-data ('45 3 * * *')
├── main/container.ts                        # container.dayPlan.*, subscriber registration
├── shared/application/tenant-cron-tick.ts   # UNCHANGED
├── shared/domain/cron-job-run.repository.ts # + ICronJobRunRepository.hasClaim
├── shared/infrastructure/prisma-cron-job-run.repository.ts  # + hasClaim impl
├── modules/inspector/.../record-inspector-app-state.use-case.ts  # pass onboardingCompleted
└── modules/inspector/infrastructure/prisma-inspector.repository.ts # onboarding_completed_at in the single $executeRaw

apps/backend/tests/integration/day-plan/    # route + db integration suites
```

**Structure Decision**: Backend web-service + shared-contracts layout. New self-contained backend module `modules/day-plan` following Clean Architecture; shared contracts in `packages/shared`; two workers and container wiring in `main/`; minimal additive changes to `cron-job-run` repo and the inspector heartbeat. No `web`/`pwa` source changes (only regenerated `api-types.ts`).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `DayPlan`/`DayPlanStop` have **no `tenant_id`** (deviation from Constitution §II "Every business entity carries `tenant_id`") | The plan belongs to an inspector, a **cross-tenant** entity, and aggregates stops from multiple agencies. A single `tenant_id` cannot represent a multi-agency route; splitting one physical plan per tenant would fragment the inspector's day and break ordering/ETAs across agencies. Constitutional precedent: `Inspector`, global `ServiceRegion`, `IntegrationSetting`, `PlatformSetting` (D10). | A `tenant_id` column would be either null (no isolation value) or force N plans per inspector per day (wrong domain model, broken routing). Isolation is instead enforced at the application layer (RBAC + `inspector_id` filter + live-appointment status join) and proven by a scoping integration test (L-F04-04, D10). |
| Reading uses a **content fingerprint** rather than trusting the stored `STALE` flag | Appointment edits that emit no domain event (`update-appointment`, `bulk-reschedule`, property coordinate change) would otherwise leave a silently-stale plan; and trusting `STALE` would force a Mapbox call on every check-out/DONE. | A pure event-driven `STALE` flag misses no-event edits (correctness bug) and would recompute on harmless execution-state changes (cost bug). The fingerprint is a deterministic sha256 of inputs (L-F04-01), the minimum that is both correct and cost-bounded. |
