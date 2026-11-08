# Implementation Plan: Inspector Program — Goals, Rewards & Period Closure (backend + shared)

**Branch**: `065-f08-1-goals-rewards-backend` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/065-f08-1-goals-rewards-backend/spec.md`

## Summary

Build the `inspector-program` backend module and its shared contracts: a platform-scoped goal model (`InspectorGoal`), a reward model (`RewardAward`), a period-closure record (`GoalPeriodClosure`), AM/OP CRUD + period/summary read routes, and one daily pg-boss job (`inspector-program.daily`, 04:45 Sydney) that closes each ended period, evaluates participants with F07's engine, and creates idempotent `PENDING` awards. Levels and streaks are **derived** (no table) and surfaced through `InspectorProgramStandingService`. Reward approval uses a `PENDING → APPROVED` compare-and-swap and leaves a no-op `IRewardAwardApprovalHook` for the F08-6 billing integration (Q12 boundary — this slice touches no billing). F07's `ReliabilityMetricsService` gains an optional `{ regionId?, serviceTypeId? }` scope and `completedServiceDates`, behaviour-preserving.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24
**Primary Dependencies**: Fastify 4, `fastify-type-provider-zod`, Prisma 6 (PostgreSQL/Supabase, PostGIS in CI), Zod 3, pg-boss 9, `@properfy/shared`; reuses F07 `ReliabilityMetricsService`/`ReliabilityIndexReader`, F03 `IPlatformSettingsReader`, billing `getCanonicalPeriod`/`isCycleAligned`/`computeClosedPeriods`
**Storage**: PostgreSQL — 3 new tables (`inspector_goals`, `reward_awards`, `goal_period_closures`), 3 new enums, **no `tenant_id`** (D12). One expand-only migration ordered after the F07 migrations. No retention/purge (low volume).
**Testing**: Vitest (unit + domain, also pinned `TZ=America/Los_Angeles`), Supertest (routes), testcontainers + PostGIS (`*.db.test.ts` for the facts-reader scope and the program repository)
**Target Platform**: Linux server (Fly.io `properfy-api*`), stateless
**Project Type**: pnpm monorepo — this slice touches `apps/backend` and `packages/shared` only (web is TASK-F08-3, PWA is TASK-F08-4)
**Performance Goals**: daily batch; **one `computeAll` per `(periodStart, periodEnd, scopeKey)` group** (7 queries each), never one per inspector; F07's query count is preserved for every unscoped call
**Constraints**: no `tenant_id` on the 3 tables (justified D12 exception); **no billing/`financial_entries`/`inspector_invoices` write** (Q12 — F08-6 owns it, via the no-op hook); ≤ 150 changed files (est. ~60); exactly one migration; `api-types` regenerated, never hand-merged
**Scale/Scope**: catch-up ≤ `CLOSE_CATCH_UP_MAX_PERIODS = 8` periods/goal/run; low award volume; ~60 files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Clean Architecture (NON-NEGOTIABLE)** — PASS. New module `apps/backend/src/modules/inspector-program/` with `domain/` (pure: `goal-periods.ts`, `evaluate-goal.ts`, `participants.ts`, `streak.ts`, `ordering.ts`, `promised-summary.ts`, entities, errors, repository/hook ports), `application/` (use cases + standing service), `infrastructure/` (Prisma repositories, worker), `interfaces/` (routes). Dependencies point inward; cross-module reuse (F07 engine, F03 settings, billing periods, region-delete guard) is through ports. The region guard is an inner-layer port `IRegionGoalUsageChecker` injected into `DeleteServiceRegionUseCase`.
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — PASS **with documented exception** (see Complexity Tracking). The 3 tables carry no `tenant_id` by D12 (precedents: `Inspector`, global `ServiceRegion`, `PlatformSetting`, `InspectorReliabilitySnapshot`), an explicit CLAUDE.md §7.1 exception recorded in the spec. Isolation: AM/OP-only admin routes, `INSP` own-data via linked inspector, `CL_*`/`TNT` → 403 (route test proves it); no row stores agency name/address/coordinate. Every sensitive op (goal CRUD, reactivation, approve, void, closure) writes an audit row (SYSTEM for job writes). Award actions require `Idempotency-Key`.
- **III. Test-Driven Development (NON-NEGOTIABLE)** — PASS. Red→green→refactor; the spec's §"Testes primeiro" enumerates 21 test groups authored before code. Program is finance-adjacent (it produces monetary rewards), so coverage is held to the critical tier. Integration/DB suites use testcontainers (never mock Prisma). F07 regression tests prove behaviour preservation.
- **IV. Contract-First APIs (NON-NEGOTIABLE)** — PASS. All payloads validated by Zod schemas in `packages/shared/src/schemas/inspector-program.ts`; routes use `fastify-type-provider-zod`; error envelope `{ error: { code, message, details } }`; lists paginate (`page`, `pageSize`, `sortBy`, `sortOrder`); `request_id` carried. OpenAPI + `api-types` regenerated via `pnpm generate:api` and committed; the region-delete route's new `409` is declared and regenerated. Expand/contract: all additive.
- **V. Simplicity and Minimal Impact** — PASS. Reuse (not copy) the billing period functions and the F07 engine; the region guard is an **optional trailing constructor parameter** (no rewiring of existing tests); the approval extension is a single no-op port, not a plugin framework; levels/streaks are derived (no table); no feature flags beyond the standard `INSPECTOR_PROGRAM_JOBS_ENABLED` kill switch; no speculative abstractions; no unrelated refactors.
- **Domain invariants** — Audit mandatory on sensitive actions: PASS. Migrations expand/contract: PASS (expand only, no destructive change, no `Unsupported()` index dropped). Commits (no Claude/Anthropic references, Conventional): PASS. Appointment State Machine: **not touched** (rewards are not appointments). Financial Rules: **not touched** — the Q12 boundary keeps all ledger/invoice work in TASK-F08-6; this slice only exposes the no-op hook.

## Project Structure

### Documentation (this feature)

```text
specs/065-f08-1-goals-rewards-backend/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API contract notes)
│   └── inspector-program.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── enums/inspector-program.ts         # GoalMetric, GoalComparator, RewardAwardStatus, InspectorLevel, maps, constants
├── enums/index.ts                     # re-export (append)
├── lib/inspector-level.ts             # resolveInspectorLevel, isEarlyAccessLevel, minScoreForLevel
├── schemas/inspector-program.ts       # create/update/list/response/periods/awards/summary/void schemas
├── schemas/platform-settings*.ts      # inspectorProgram registry entry (append)
└── permissions/role-matrix.ts         # inspector_program.* actions (append)

apps/backend/src/modules/inspector-program/
├── domain/
│   ├── goal.entity.ts
│   ├── reward-award.entity.ts         # status transitions
│   ├── goal-periods.ts                # reuse billing funcs; goalPeriodsToClose/currentGoalPeriod/periodsToSkipOnReactivation/goalTermsForPeriod/minEndsAt
│   ├── evaluate-goal.ts
│   ├── participants.ts
│   ├── streak.ts
│   ├── ordering.ts
│   ├── promised-summary.ts
│   ├── messages-run-at.ts             # pure messagesRunAt(now)
│   ├── inspector-program.errors.ts
│   ├── goal.repository.ts             # ports
│   ├── reward-award.repository.ts
│   ├── goal-period-closure.repository.ts
│   ├── reward-award-approval.hook.ts  # IRewardAwardApprovalHook (+ NoopRewardAwardApprovalHook)
│   └── __fixtures__/
├── application/
│   ├── use-cases/{create-goal,update-goal,list-goals,get-goal,list-program-periods,close-goal-periods,list-reward-awards,get-program-period-summary,approve-reward-award,void-reward-award,run-inspector-program-daily}.use-case.ts
│   └── inspector-program-standing.service.ts
├── infrastructure/
│   ├── prisma-goal.repository.ts
│   ├── prisma-reward-award.repository.ts
│   ├── prisma-goal-period-closure.repository.ts
│   └── workers/inspector-program-daily.worker.ts
└── interfaces/inspector-program.routes.ts

apps/backend/src/modules/reliability/           # F07 extension (owned here)
├── domain/reliability-facts.reader.ts          # ReliabilityFactsScope; InspectorReliabilityComputation.completedServiceDates
├── application/reliability-metrics.service.ts   # scope passthrough
└── infrastructure/prisma-reliability-facts.reader.ts  # Q1/Q2/Q3 scope predicates

apps/backend/src/modules/service-region/
├── domain/region-goal-usage.checker.ts         # IRegionGoalUsageChecker port
├── domain/service-region.errors.ts             # ServiceRegionHasActiveGoalsError (append)
└── application/use-cases/delete-service-region.use-case.ts  # optional trailing param

apps/backend/prisma/schema.prisma + migrations/<ts>_inspector_program/migration.sql
apps/backend/src/main/{container.ts,workers.ts}  # wiring
```

**Structure Decision**: Monorepo backend + shared. A new self-contained `inspector-program` module follows Clean Architecture; the F07 engine and the `service-region` delete guard are extended through inner-layer ports so no existing module takes a new outward dependency. No web/pwa files change in this slice.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 3 tables without `tenant_id` (Constitution §II requires `tenant_id` on business entities) | Goals/awards/closures are platform-program entities about a cross-tenant subject (the inspector); a `tenant_id` would be meaningless and would fracture one inspector's program across agencies. D12 of the task, matching the `Inspector`/`ServiceRegion`/`PlatformSetting`/`InspectorReliabilitySnapshot` precedents. | Adding a nullable `tenant_id` "meaning platform" was rejected: it invites a silent `if (tenantId)` filter that would hide another inspector's rows and contradict the single-program model. Isolation is instead enforced by RBAC (AM/OP admin, INSP own, CL_*/TNT 403) + an explicit route 403 test. |
| F07 `ReliabilityMetricsService` extended by this feature (cross-module ownership) | Region-/service-type-scoped volume goals and `achievedOn` need a scoped facts read and `completedServiceDates`; F07 deliberately left the extension point for F08. | Duplicating the facts reader in `inspector-program` was rejected (two definitions of the service universe would drift). The extension is additive and proven behaviour-preserving by F07's own regression tests and query-count assertions. |
