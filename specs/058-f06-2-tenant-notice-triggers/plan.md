# Implementation Plan: Tenant Arrival Notice Triggers (Morning, On-The-Way, Delay)

**Branch**: `058-f06-2-tenant-notice-triggers` | **Date**: 2026-11-06 | **Spec**: `./spec.md`
**Input**: Feature specification from `/specs/058-f06-2-tenant-notice-triggers/spec.md`
**Authoritative source**: `fase2-etapa1/tarefas/F06-tarefas.md` §TASK-F06-2 (decisions D1–D19, L-F06-01..11, all closed).

## Summary

Make F06's tenant arrival notices actually fire. Three trigger families — a per-agency 07:00 **morning** job (cutoff 09:00), domain-event **subscribers** on inspector check-out / can't-do / late-notice that enqueue a durable `tenant-eta.evaluate` job, and a 30-minute **delay sweep** — all funnel into one idempotent `TenantEtaNotifier`. The notifier applies every suppression guard (enabled, morning-hour floor, agency ETA flag, rental-tenant switch, flow type, tenant confirmation, ≤ 60-min on-the-way lead, SMS budget reserve), builds the payload via the existing pipeline, and dedupes atomically through F06-1's deterministic UUID + `CreateNotificationUseCase.created`. Prediction reuses F06-1's shared `projectStopEta` (no re-implementation). This PR also fixes a latent consent defect handed from F06-1: OPERATIONAL **email** consent matching is case-sensitive, so an opt-out would silently fail to block once sends begin. **No migration, no new HTTP route, no `api-types.ts` change.**

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24; pnpm 9 + Turborepo.
**Primary Dependencies**: backend — Fastify 4, Prisma 6 (read-only for plans; `notification_consents` write via existing repo), pg-boss 9, existing `notification`/`tenant-eta`/`day-plan`/`inspector-execution` modules; shared — F06-1 `projectStopEta`/`isProjectedLate`, `tenant-eta` constants, `isTenantEtaNoticesEnabled`, `toE164Au`.
**Storage**: PostgreSQL — read-only joins over `day_plans`/`day_plan_stops`/`appointments`/`service_types`/`inspection_executions`/`inspector_field_events` via F06-1's `PrismaTenantEtaPlanReader`; `notifications` reads for dedupe/budget/volume; `notification_consents` write only through the existing repo. **No schema change / no migration** (FR-022).
**Testing**: Vitest (unit + backend route-integration), testcontainers (`test:integration:db` for the morning end-to-end + any reader assertions), Supertest not needed (no new route).
**Target Platform**: Fly.io backend (two machines; pg-boss schedules are cluster-wide, the sweep is a singleton).
**Project Type**: Monorepo backend feature — `apps/backend`, with small `packages/shared` touch only if a trigger/notifier constant must be shared (expected none beyond F06-1's existing constants).
**Performance Goals**: morning job is O(inspectors×stops) per agency within the 07:00–09:00 window; the evaluate job is per-event; the sweep is a 30-min singleton over today's published plans. The fresh read may recompute a plan via Mapbox only when its fingerprint changed (same cost the next inspector GET would pay).
**Constraints**: all tenant-facing text/bands in the stop's agency timezone; pg-boss schedules on `PLATFORM_TIMEZONE`; dedupe + one-per-day keyed on agency-local midnight; SMS reserve bucket is UTC (inherited, out of scope to fix); GSM-7 bodies (F06-1 templates); best-effort (non-atomic) budget reserve with the pipeline hard cap as the real ceiling.
**Scale/Scope**: ~30 changed files estimated (notifier + 3 use cases + 3 services + 3 subscribers + notice-log port/impl + finish-use-case + metrics + container/workers wiring + consent fix + CLAUDE.md + tests); hard cap 150.

## Constitution Check

*GATE: Must pass before Phase 0. Re-checked after Phase 1 design.*

- **I. Clean Architecture (NON-NEGOTIABLE)** — PASS. The new work lives in `apps/backend/src/modules/tenant-eta/application/` (notifier, use cases, services, subscribers) and `infrastructure/` (notice-log Prisma adapter) over F06-1's `domain/` port. The notifier and use cases depend only on ports (`ITenantEtaPlanReader`, `INotificationRepository`, `ITenantEtaNoticeLog`, `IPlatformSettingsReader`, repos, `CreateNotificationUseCase`, `IJobQueue`); no Prisma/Fastify/pg-boss import in application. Subscribers are thin (enqueue only). Workers stay in `main/`.
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — PASS with recorded exception. `DayPlan`/`DayPlanStop` and the `tenantEtaNotices` setting are platform-scoped (F04 D10 / §7.1) — read cross-tenant only to compute times; the new `ITenantEtaNoticeLog.countSmsCreatedSince` is a cross-tenant platform metric (same D9 exception). **No HTTP route is added**, so nothing exposes cross-tenant data; every notification row is created with the appointment's own `tenant_id`, and every `appointmentRepo.findById`/`tenantRepo.findById` is called with that stop's `tenantId`. Inspector GPS is never in scope (bands carry no coordinates). The morning end-to-end integration test proves per-agency isolation (two tz groups, each notifies only its own stops).
- **III. TDD (NON-NEGOTIABLE)** — PASS. The task file enumerates ~60 red-green cases (notifier guards 1–10e, morning 11–21, integration 22, worker 23–27, subscribers 28–29, evaluate 30–43h, sweep 43i–49g, dedupe/race 50–52, workers 53). Tests authored before implementation.
- **IV. Contract-First APIs (NON-NEGOTIABLE)** — PASS / N/A. No new route and no contract change: `api-types.ts` is untouched (FR-022). Job payloads are internal (documented in `contracts/`). The opt-out route + `tenantEtaNoticesEnabled` shipped in F06-1.
- **V. Simplicity and Minimal Impact** — PASS. No migration, no send-pipeline change beyond the consent fix, no new route. Prediction reuses `projectStopEta`. The three triggers share one notifier and one `evaluateForPlan`. The consent fix is a single repo choke point (email lowercasing), not a schema or pipeline rewrite.

No violations → Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/058-f06-2-tenant-notice-triggers/
├── plan.md              # This file
├── research.md          # Phase 0 — consent-fix decision, contract reconciliation, payload-type decision
├── data-model.md        # Phase 1 — notifier input, job payload, logs/metrics, notice-log port
├── quickstart.md        # Phase 1 — verification recipe
├── contracts/           # Phase 1 — job + event + log contracts (no HTTP route)
└── tasks.md             # Phase 2 — /speckit.tasks output
```

### Source Code (repository root)

```text
apps/backend/src/modules/tenant-eta/
├── application/
│   ├── tenant-eta-notifier.service.ts            # TenantEtaNotifier (all guards + dedupe + budget + metrics)
│   ├── services/
│   │   ├── evaluate-for-plan.ts                  # common seed-in-plan flow (FRESH/STALE, planVersion re-read)
│   │   ├── evaluate-plan-delays.ts              # per-pending-late-stop → notifier DELAY
│   │   └── evaluate-early-changes.ts            # L-F06-05 EARLY_CHANGE via morning bands
│   ├── use-cases/
│   │   ├── send-morning-eta-notices.use-case.ts # 01.12-B
│   │   ├── evaluate-tenant-eta.use-case.ts      # 01.10 + 01.12 (FINISH/CANT_DO/LATE_NOTICE)
│   │   └── sweep-tenant-eta-delays.use-case.ts  # 01.12 sweep
│   ├── subscribers/
│   │   ├── enqueue-tenant-eta-on-done.subscriber.ts
│   │   ├── enqueue-tenant-eta-on-cant-do.subscriber.ts
│   │   └── enqueue-tenant-eta-on-late-notice.subscriber.ts
│   └── ports/tenant-eta-notice-log.ts           # ITenantEtaNoticeLog
├── domain/                                        # (F06-1: eta-band, id, reader port, constants) — unchanged
└── infrastructure/
    └── prisma-tenant-eta-notice-log.ts           # findMorningBands, countSmsCreatedSince

apps/backend/src/modules/inspector-execution/application/use-cases/finish-inspection.use-case.ts  # auditMetadata: { source: 'INSPECTOR_FINISH' }
apps/backend/src/modules/appointment/.../ (constant TRANSITION_SOURCE_INSPECTOR_FINISH alongside F03's INSPECTOR_CANT_DO)
apps/backend/src/modules/notification/infrastructure/prisma-notification-consent.repository.ts     # email lowercasing (consent fix)
apps/backend/src/modules/notification/application/use-cases/record-consent-opt-out.use-case.ts     # normalizeRecipient email lowercase + doc fix
apps/backend/src/shared/infrastructure/metrics.ts                                                  # incrementTenantEtaNoticeCount + tenantEtaNoticeCounts
apps/backend/src/main/tenant-eta.worker.ts        # registerTenantEtaWorkers (morning cron + evaluate work + sweep cron) — mirrors day-plan-publish.worker.ts
apps/backend/src/main/workers.ts                  # call registerTenantEtaWorkers inside registerWorkers (+3 work / +2 schedule)
apps/backend/src/main/container.ts                # container.tenantEta.* (notifier, 3 use cases, notice-log) + 3 subscribers .register(domainEventBus)
apps/backend/src/main/server.ts                   # pass the new use cases to registerWorkers

CLAUDE.md (root) + apps/backend/CLAUDE.md          # X00 doc rule §13.11
```

**Structure Decision**: Monorepo backend feature. All new code is the `application/`+`infrastructure/` layers of the existing `tenant-eta` module (F06-1 owns its `domain/`). The three pg-boss workers are grouped in a dedicated `main/tenant-eta.worker.ts` (mirroring `day-plan-publish.worker.ts`) called from `registerWorkers`, keeping `registerWorkers`' positional-param growth to the three use cases + settings reader. The consent fix is a surgical change to the consent repository choke point. No `packages/shared` change is expected (F06-1 already exported every shared constant/type).

## Complexity Tracking

No constitution violations — not applicable.
