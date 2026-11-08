---
description: "Task list for F08-1 Inspector Program (backend + shared)"
---

# Tasks: Inspector Program — Goals, Rewards & Period Closure (backend + shared)

**Input**: Design documents from `/specs/065-f08-1-goals-rewards-backend/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — TDD is NON-NEGOTIABLE (Constitution §III). Test tasks precede their implementation.

**PAR ownership** (this is a paired task; one worktree, sequential handoff):
- **(P) Pilar** — goes first: shared enums/lib/settings, Prisma models + migration + CHECKs, F07 engine extension, all pure domain + evaluation/levels/streak, closure job + orchestration, CAS repository + approval hook port, standing service, worker, container wiring, and their tests.
- **(E) Esteio** — after handoff: shared Zod schemas, `role-matrix` append, goal CRUD use-cases + routes, approve/void use-cases + routes (on Pilar's CAS + hook), region-delete guard, and their tests.
- **Boundary Q12**: no `billing`/`financial_entries`/`inspector_invoices` write; the `IRewardAwardApprovalHook` stays no-op for TASK-F08-6.

**Absolute root**: `/Users/pedro/Code/GitHub/properfy/.claude/worktrees/065-f08-1-goals-rewards-backend`
Paths below are relative to that root.

## Phase 1: Setup

- [ ] T001 (P) Create module skeleton dirs `apps/backend/src/modules/inspector-program/{domain,domain/__fixtures__,application/use-cases,infrastructure/workers,interfaces}` (empty index placeholders only).

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: shared contracts + Prisma + F07 extension must exist before any use case compiles. Pilar lands all of Phase 2 before handing off.

### Shared contracts

- [ ] T002 (P) Write `packages/shared/src/enums/inspector-program.test.ts` (GoalMetric order, `GOAL_METRIC_COMPARATOR`, `GOAL_METRIC_RELIABILITY_KEY`, `GOAL_METRIC_KIND`, labels, `GOAL_RATE_MINIMUM_VOLUME`, `CLOSE_CATCH_UP_MAX_PERIODS`, `UPCOMING_GOAL_LOOKAHEAD_DAYS`).
- [ ] T003 (P) Implement `packages/shared/src/enums/inspector-program.ts` and re-export from `enums/index.ts` (green for T002).
- [ ] T004 (P) Write `packages/shared/src/lib/inspector-level.test.ts` (resolveInspectorLevel table, isEarlyAccessLevel, minScoreForLevel).
- [ ] T005 (P) Implement `packages/shared/src/lib/inspector-level.ts` (green for T004).
- [ ] T006 (P) Add `inspectorProgram` to `platform-settings.test.ts` (defaults, enabledAt validation, silver=gold error, bounds, `resolvePlatformSettingValue`).
- [ ] T007 (P) Implement `inspectorProgramSettingSchema` + registry entry `inspectorProgram` (defaults, `section`) in the platform-settings registry (green for T006).
- [ ] T008 [P] (E) Write `packages/shared/src/schemas/inspector-program.test.ts` (createGoalSchema, updateGoalSchema `.strict()`, voidAwardSchema `.strict()` no recoveryNote, programPeriodsQuerySchema `.strict()`).
- [ ] T009 (E) Implement `packages/shared/src/schemas/inspector-program.ts` — all request/response/query schemas per contracts (green for T008).
- [ ] T010 (E) Append `inspector_program.goals.manage`, `.awards.view`, `.awards.approve`, `.awards.void` (AM, OP) and `.view_own` (INSP) to `packages/shared/src/permissions/role-matrix.ts` (append only); update the role-matrix count/coverage test.
- [ ] T011 (P) `pnpm --filter @properfy/shared build` green; shared typecheck + lint green.

### Prisma (expand-only migration, no `tenant_id`)

- [ ] T012 (P) Add enums `GoalMetric`/`GoalComparator`/`RewardAwardStatus` and models `InspectorGoal`/`RewardAward`/`GoalPeriodClosure` + back-relations (`Inspector`, `ServiceRegion`, `ServiceType`, `User` ×4) to `apps/backend/prisma/schema.prisma` per data-model.md.
- [ ] T013 (P) Generate the migration (`prisma migrate dev --name inspector_program`), add the SQL CHECK constraints (scope/comparator/dates/values/active/next_terms/status_fields) by hand, verify the diff drops **no** `Unsupported()` index, and apply locally.
- [ ] T014 (P) `pnpm --filter backend exec prisma generate`; backend typecheck green with the new client.

### F07 engine extension (behaviour-preserving)

- [ ] T015 (P) Extend `reliability-metrics.service.test.ts`: regression (unscoped numbers + query count unchanged), scope passthrough, `completedServiceDates` shape; grep + update all `computeAll`/`InspectorReliabilityComputation` mocks first.
- [ ] T016 (P) Add `ReliabilityFactsScope` + optional `scope` to `IReliabilityFactsReader.load` and `completedServiceDates` to `InspectorReliabilityComputation` in `reliability/domain/reliability-facts.reader.ts`; thread `scope?` through `computeMetric`/`computeAll` in `reliability/application/reliability-metrics.service.ts`.
- [ ] T017 (P) Add the scope predicates (`$6::text`/`$7::text`, PostGIS `ST_Intersects`) to Q1/Q2(both branches)/Q3 and collect `completedServiceDates` in `infrastructure/prisma-reliability-facts.reader.ts`; keep Q4–Q6 and `loadCompletedCounts` unscoped (green for T015).
- [ ] T018 (P) Write `apps/backend/tests/integration-db/.../reliability-facts.reader.db.test.ts` additions (scope filters, geom NULL, query count unchanged, unscoped deep-equal regression).

**Checkpoint**: shared + Prisma + F07 extension green. Domain/use-case work can begin.

---

## Phase 3: User Story 1 — Close each period and create reward awards (P1) 🎯 MVP

**Goal**: the daily job closes ended periods and creates idempotent `PENDING` awards (03.A4, 03.9).
**Independent Test**: `CloseGoalPeriodsUseCase` against fakes + F07 fixtures produces the expected closure + awards; re-run is a no-op; MESSAGES enqueued.

- [ ] T019 [P] (P) Fixtures `domain/__fixtures__/` — `buildGoal(overrides)`, `buildComputation(overrides)` (InspectorReliabilityComputation + completedServiceDates).
- [ ] T020 [P] (P) Write `domain/goal-periods.test.ts` (goalPeriodsToClose, currentGoalPeriod, periodsToSkipOnReactivation, goalTermsForPeriod, minEndsAt).
- [ ] T021 (P) Implement `domain/goal-periods.ts` reusing billing `getCanonicalPeriod`/`isCycleAligned`/`computeClosedPeriods` (no copy); green for T020.
- [ ] T022 [P] (P) Write `domain/evaluate-goal.test.ts` (volume/region/rate/index/CANT_DO_MAX/rounding/null-rate/LATE_NOTICE DV6, DR3 cases).
- [ ] T023 (P) Implement `domain/evaluate-goal.ts` (green for T022), using shared `GOAL_METRIC_*` + F07 `computeReliabilityScore`.
- [ ] T024 [P] (P) Write `domain/participants.test.ts`; implement `domain/participants.ts` (resolveParticipants by scope).
- [ ] T025 [P] (P) Write `domain/ordering.test.ts`; implement `domain/ordering.ts` (`compareAwardsForRanking`, P9).
- [ ] T026 [P] (P) Write `domain/promised-summary.test.ts`; implement `domain/promised-summary.ts` (`summarizePeriod`, P10).
- [ ] T027 [P] (P) Write `domain/messages-run-at.test.ts`; implement `domain/messages-run-at.ts` (`messagesRunAt`, also `TZ=America/Los_Angeles`).
- [ ] T028 (P) Implement `domain/goal.entity.ts`, `domain/reward-award.entity.ts` (status transitions), `domain/inspector-program.errors.ts`, and ports `domain/goal.repository.ts`/`reward-award.repository.ts`/`goal-period-closure.repository.ts`/`reward-award-approval.hook.ts` (+ `NoopRewardAwardApprovalHook`).
- [ ] T029 (P) Implement Prisma repositories `infrastructure/prisma-{goal,reward-award,goal-period-closure}.repository.ts` incl. `createMany skipDuplicates`, CAS `approvePending`/`voidPending`, `findParticipations`, `findStarts`, `countActiveByScopeRegionId`.
- [ ] T030 (P) Write `application/close-goal-periods.use-case.test.ts` (closure+awards, idempotent re-run, skipDuplicates count 0, grouping by (period,scope), SKIPPED handling, next-terms promotion, scope_label, DR2 stale snapshot, DR4 definitive, MESSAGES enqueue, settings via `get`).
- [ ] T031 (P) Implement `application/use-cases/close-goal-periods.use-case.ts` (Algorithm B + B2 promotion; audit after commit) — green for T030.
- [ ] T032 (P) Implement `application/use-cases/run-inspector-program-daily.use-case.ts` (trigger phases; `ScheduleMessagesRunStep` enqueue) + step types.
- [ ] T033 (P) Write `infrastructure/workers/inspector-program-daily.worker.test.ts` (one `boss.schedule 45 4 * * *`, startup enqueue with singletonKey, trigger passthrough, `INSPECTOR_PROGRAM_JOBS_ENABLED`); implement the worker.
- [ ] T034 (P) Write `inspector-program.repository.db.test.ts` (uniques, all CHECKs incl. VOID-with-paid_at, `createMany skipDuplicates` count 0, CAS, `findParticipations`, `index_snapshot_date` round-trip, region SetNull).
- [ ] T035 (P) Implement `application/use-cases/list-reward-awards.use-case.ts` + `get-program-period-summary.use-case.ts` (P9 ordering, open-period summary).
- [ ] T036 (E) Routes `GET /v1/inspector-program/awards` + `GET /v1/inspector-program/summary` (`awards.view`) using the T035 use-cases, in `interfaces/inspector-program.routes.ts`.

**Checkpoint**: MVP — awards are produced, listable, and summed.

---

## Phase 4: User Story 2 — Define and manage goals (P1)

**Goal**: AM/OP goal CRUD with reactivation, pending terms, `endsAt` guard (03.6/03.8, 03.A5).
**Independent Test**: CRUD use-cases + schemas enforce validation and audit; reactivation writes SKIPPED closures; term edits land next period.

- [ ] T037 [P] (E) Write `application/goal-crud.use-case.test.ts` (create/update/deactivate/reactivate, pending terms, GOAL_END_IN_CURRENT_PERIOD, scope-not-found, region-deleted, audits, periods route).
- [ ] T038 (E) Implement `application/use-cases/create-goal.use-case.ts` (scope existence, alignment, not-in-past, audit).
- [ ] T039 (E) Implement `application/use-cases/update-goal.use-case.ts` (next_* terms, reactivation SKIPPED_INACTIVE closures via repo, `minEndsAt` guard, deactivate/reactivate audits).
- [ ] T040 [P] (E) Implement `application/use-cases/list-goals.use-case.ts` + `get-goal.use-case.ts` (pagination, 404).
- [ ] T041 (E) Implement `application/use-cases/list-program-periods.use-case.ts` (DL10 direction semantics).
- [ ] T042 (E) Routes `GET/POST /goals`, `GET/PATCH /goals/:goalId`, `GET /periods` in `interfaces/inspector-program.routes.ts`.

---

## Phase 5: User Story 3 — Review (approve / void) reward awards (P2)

**Goal**: CAS approve + void with no-op hook, Q12 (no manual pay) (03.13, 03.A5).
**Independent Test**: approve/void use-cases + routes; concurrency 409; idempotency; `PAID`/`VOID` rejected; no mark-paid route.

- [ ] T043 [P] (E) Write `application/reward-award-actions.use-case.test.ts` (approve CAS, concurrent 409, any AM/OP, void PENDING/APPROVED + inspectorNote, reject PAID/VOID, no mark-paid, idempotency, 403).
- [ ] T044 (E) Implement `application/use-cases/approve-reward-award.use-case.ts` (idempotency, `PENDING→APPROVED` CAS, invoke `IRewardAwardApprovalHook`, audit).
- [ ] T045 (E) Implement `application/use-cases/void-reward-award.use-case.ts` (`PENDING/APPROVED→VOID` CAS, reason + inspectorNote, invoke hook, audit).
- [ ] T046 (E) Routes `POST /awards/:awardId/approve` + `POST /awards/:awardId/void` (`Idempotency-Key`), wire the no-op hook in the container.

---

## Phase 6: User Story 4 — F07 scope & service dates (P2)

Implemented in Phase 2 (T015–T018); this story's acceptance is proven there. No additional tasks.

---

## Phase 7: User Story 5 — Level, streak, standing, partial progress (P2)

**Goal**: derived level/streak + standing service + partial progress (consumed by F08-2/4).
**Independent Test**: streak/standing/progress against fakes and fixtures.

- [ ] T047 [P] (P) Write `domain/streak.test.ts`; implement `domain/streak.ts` (`computeStreak`, `isStreakAtRisk`, P11).
- [ ] T048 (P) Write `application/standing-progress.test.ts` (getStanding, getActiveGoalProgress(ForMany), UPCOMING lookahead, countsSince, SKIPPED current, hasEarlyAccess).
- [ ] T049 (P) Implement `application/inspector-program-standing.service.ts` (Algorithm D/E/F) — green for T048.

---

## Phase 8: User Story 6 — inspectorProgram setting (P3)

Implemented in Phase 2 (T006–T007). No additional tasks.

---

## Phase 9: User Story 7 — Program periods route (P3)

Covered by T041/T042 (`list-program-periods` + route). No additional tasks.

---

## Phase 10: Region-delete guard

- [ ] T050 (E) Add the 409 case to `apps/backend/tests/unit/service-region/delete-service-region.use-case.test.ts` + the route test case.
- [ ] T051 (E) Add `IRegionGoalUsageChecker` port (service-region domain), `ServiceRegionHasActiveGoalsError` (`service-region.errors.ts`), and the optional-trailing-param check in `delete-service-region.use-case.ts`; implement the checker via `IGoalRepository.countActiveByScopeRegionId`.

---

## Phase 11: Wiring, routes aggregation, RBAC test

- [ ] T052 (P) Wire `container.inspectorProgram` (use cases, standing service, regionGoalUsageChecker, no-op hook) in `apps/backend/src/main/container.ts`; inject the region checker into `DeleteServiceRegionUseCase`.
- [ ] T053 (P) Register the worker + log line in `apps/backend/src/main/workers.ts` (behind `INSPECTOR_PROGRAM_JOBS_ENABLED`, default true).
- [ ] T054 (E) Write `interfaces/inspector-program.routes.test.ts` (Supertest) — every route AM/OP 2xx, CL_ADMIN/CL_USER/INSP/TNT 403, no-token 401, 404 GOAL_NOT_FOUND, response schemas complete.

---

## Phase 12: Polish & Cross-Cutting

- [ ] T055 (P) `pnpm generate:api` (OpenAPI → `api-types`); commit `openapi.json` + `api-types.ts`.
- [ ] T056 (P) Update `apps/backend/CLAUDE.md` (module `inspector-program`: D12 exception, single 04:45 job + 08:00 messages enqueue, system-award approval, reactivation/terms, Q12 no manual pay, F07 scope, region guard, stale-snapshot `index_snapshot_date`, DR5 timezone table) and `packages/shared/CLAUDE.md` (`enums/inspector-program.ts`, `lib/inspector-level.ts`, `inspectorProgram` key); append an F08-1 line to the root `CLAUDE.md` Active Technologies (keep-all).
- [ ] T057 (P) Full gate via subagent: `@properfy/shared build test`; `backend typecheck lint test`; `test:integration` + `test:integration:db`; `git diff --stat origin/develop... | tail -1` < 150.

---

## Dependencies & handoff

- **Pilar first**: Phase 1 → Phase 2 (all) → Phase 3 (T019–T034, T036) → Phase 7 → T052/T053/T055.
- **Handoff to Esteio** (worktree path via maestri): T008/T009 (schemas), T010 (role-matrix), T036 (awards/summary routes) + Phase 4 + Phase 5 + Phase 10 + T054. Esteio builds on Pilar's enums, Prisma models, CAS repo methods, the `list-reward-awards`/`get-program-period-summary` use-cases (T035), and the `IRewardAwardApprovalHook` port.
- **Integration**: Pilar runs the full gate (T057), the review loop, and opens/credits the PR.
- T008/T009 (schemas, Esteio) can be authored in parallel conceptually but land after handoff; the enums (T003) they import are Pilar's and already in place.

## Parallel opportunities

- Within Pilar's domain: T019–T027 are `[P]` (distinct files).
- Within Esteio's slice: T037 and T043 test files are `[P]`; T040 is `[P]`.
- Cross-owner concurrency is NOT allowed in the shared worktree (sequential handoff only).
