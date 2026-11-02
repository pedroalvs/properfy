# Tasks: Service-type duration, routing port, pure optimizer and PlanRouteService (TASK-F04-1)

**Input**: Design documents from `/specs/051-f04-1-routing-optimizer/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Tests**: INCLUDED — TDD is constitution-mandated (Principle III). Every test task is written red before its implementation task.
**Pair ownership**: `(Pilar)` = the I/O slice (adapters, dynamic, limiter, PlanRouteService, duration/migration, wiring, metrics). `(Esteio)` = the pure shared optimizer and its Vitest suite. One PR, two authors.

## Phase 1: Setup

- [ ] T001 Confirm the worktree baseline is green (haiku setup already ran: `pnpm install`, `prisma generate`, shared + frontend-standards build, backend/shared typecheck + lint all PASS) — no action if still green.
- [ ] T002 [P] (Pilar) Create the backend module skeleton dirs `apps/backend/src/modules/day-plan/{domain,infrastructure/routing/__tests__,application/services/__tests__}`.
- [ ] T003 [P] (Esteio) Create the shared slice dir `packages/shared/src/route-planning/`.

## Phase 2: Foundational (BLOCKING — must complete before user-story phases)

**The shared optimizer contract and the backend ports/schema/metrics everything else depends on.**

- [ ] T004 (Esteio) Author `packages/shared/src/route-planning/types.ts` from data-model.md §3 (`RouteWeights`, `DEFAULT_ROUTE_WEIGHTS`, the three coordinate/stop constants, `OptimizerStop`, `OptimizerInput`, `EvaluatedStop`, `SequenceEvaluation`, `OptimizationResult`, `OptimizerMethod`, function signatures, `RouteOrderMismatchError`). Types + error only (no logic yet). **This file is the contract both the optimizer (US1) and `PlanRouteService` (US2) compile against — do it first and signal the pair.**
- [ ] T005 [P] (Pilar) Author `apps/backend/src/modules/day-plan/domain/routing.service.ts` — `RoutePoint`, `RoutingProviderName`, `MatrixProfile`, `RoutingMatrix`, `RoutingLeg`, `RoutingCallOptions`, `IRoutingService`, `RoutingProviderError`, `RoutingDeferredError` (contracts/routing-service.contract.md).
- [ ] T006 [P] (Pilar) Author `apps/backend/src/modules/day-plan/domain/routing-rate-limiter.ts` — `RoutingRateBucket`, `IRoutingRateLimiter`.
- [ ] T007 (Pilar) Edit `apps/backend/prisma/schema.prisma`: add `default_duration_minutes Int @default(45)` to `ServiceType` and the `RoutingRateLimitBucket` model (no `tenant_id`). Then `prisma migrate dev --create-only` twice → `<ts>_service_type_default_duration` and `<ts>_routing_rate_limit_buckets`; hand-write the CHECK + backfill block (migration.sql) and the bucket `CREATE TABLE` + seed (3 rows). Verify the diff drops no `Unsupported()` nor the `lower(name)` functional index; `prisma generate`.
- [ ] T008 [P] (Pilar) Extend `apps/backend/src/shared/infrastructure/metrics.ts` — `recordRoutingProviderCall({ api, outcome, elements, code? })` accumulating `routingProviderCalls[api][outcome]`, `routingMatrixElements`, `routingProviderFailuresByCode[code]` (non-OK) in the snapshot.

**Checkpoint**: shared `types.ts` compiles; backend ports + schema + metrics compile. The pair can now work US1 (Esteio) and US2/US3/US4 (Pilar) in parallel in this same worktree.

## Phase 3: User Story 1 — Deterministic base-anchored optimizer (P1) · (Esteio)

**Goal**: `optimizeRoute`/`evaluateSequence`/`insertIntoOrder` produce the documented orders/costs/timings, deterministic, exact == brute force ≤ 8, heuristic ≥ greedy ≥ 9. **Independent test**: `pnpm --filter @properfy/shared test route-optimizer`.

- [ ] T009 [US1] (Esteio) Write `packages/shared/src/route-planning/route-optimizer.test.ts` RED — all of spec "Tests first §A" (1, 2, 3, 4, 5, 6, 6b, 6c, 7, 8, 9, 10, 11, 11b, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22), using the documented "line" matrix fixtures and seeded PRNG instances.
- [ ] T010 [P] [US1] (Esteio) `packages/shared/src/route-planning/haversine.ts` — `haversineMeters` (R = 6371008.8). (test 21)
- [ ] T011 [P] [US1] (Esteio) `packages/shared/src/route-planning/matrix-profile.ts` — `selectMatrixProfile`. (test 22)
- [ ] T012 [US1] (Esteio) `packages/shared/src/route-planning/compare.ts` — `compareEvaluations`, `toWeightTenths`. (tests 16, ordering in 1–8)
- [ ] T013 [US1] (Esteio) `packages/shared/src/route-planning/evaluate-sequence.ts` — `evaluateSequence` with forward slack and `legTravelS`/`earliestDepartureS`; throws `RouteOrderMismatchError`. (tests 6c, 13, 14, 15, 17, 19)
- [ ] T014 [US1] (Esteio) `packages/shared/src/route-planning/optimize-route.ts` — `optimizeRoute` (exact DFS with safe pruning; nearest-feasible + 2-opt; method selection; `forceMethod`). (tests 1–11, 20)
- [ ] T015 [US1] (Esteio) `packages/shared/src/route-planning/insert-into-order.ts` — `insertIntoOrder`. (test 18)
- [ ] T016 [US1] (Esteio) `packages/shared/src/route-planning/index.ts` barrel + export `route-planning` and `constants/service-type` from `packages/shared/src/index.ts`; `pnpm --filter @properfy/shared build` so backend/PWA consume `dist/`. Turn T009 GREEN.

**Checkpoint**: US1 independently shippable — the optimizer passes with no I/O.

## Phase 4: User Story 2 — Provider adapter + PlanRouteService degrade safely, no token leak (P1) · (Pilar)

**Goal**: Mapbox/stub adapters with correct URLs, timeouts, typed errors, token redaction; `PlanRouteService` orchestration with interactive stub fallback vs. strict deferral. **Independent test**: `pnpm --filter backend test mapbox-routing plan-route`.

- [ ] T017 [US2] (Pilar) Write `apps/backend/src/modules/day-plan/infrastructure/routing/__tests__/mapbox-routing.service.test.ts` RED — spec tests 29, 30, 31, 32, 33 (fake timers), 34, 35, 36, 37, 38, 39, 40, 40b (fetch mocked; in-memory fake limiter).
- [ ] T018 [US2] (Pilar) Implement `apps/backend/src/modules/day-plan/infrastructure/routing/mapbox-routing.service.ts` — Matrix/Directions URLs, `selectMatrixProfile`, `depart_at ≥ now+60s` rule, 8000/5000 ms aborts, typed errors, limiter `acquire`/`drain`, `CircuitBreaker('mapbox-routing',5,60s)`, `routing.provider_call` log + metrics, **token never logged/embedded**, no `MAPBOX_ACCESS_TOKEN` read. Turn T017 GREEN.
- [ ] T019 [P] [US2] (Pilar) Write `.../routing/__tests__/stub-routing.service.test.ts` RED then implement `stub-routing.service.ts` — spec tests 41, 42 (`STUB_ROAD_FACTOR 1.3`, `STUB_SPEED_MPS 40/3.6`).
- [ ] T020 [US2] (Pilar) Write `apps/backend/src/modules/day-plan/application/services/__tests__/plan-route.service.test.ts` RED — spec tests 44, 44b, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54 (fake `IRoutingService`, injected clock, Sydney/DST/Perth fixtures).
- [ ] T021 [US2] (Pilar) Implement `apps/backend/src/modules/day-plan/application/services/plan-route.service.ts` — normalize → matrix (or cached/stub) → `optimizeRoute`/`insertIntoOrder` → final Directions pass (per-leg `departAt`, `<10 m` skip, L-F04-13) → `evaluateSequence(legTravelS)` → geometry/legs/usage; interactive stub `approximate` vs. strict `RoutingDeferredError`; coordinate/token-free `day_plan.route_computed` + `routing.fallback`/`routing.too_many_coordinates` logs. Turn T020 GREEN.

**Checkpoint**: US2 shippable against a fake provider — a Mapbox failure never breaks interactive; strict defers.

## Phase 5: User Story 3 — Shared Mapbox budget + kill switch (P2) · (Pilar)

**Goal**: cluster-wide token bucket in Postgres, `drain`, independent buckets; `DynamicRoutingService` per-call resolution + `DAY_PLAN_ROUTING_PROVIDER` kill switch validated at boot. **Independent test**: `pnpm --filter backend test:integration:db routing-rate-limiter` + `pnpm --filter backend test dynamic-providers`.

- [ ] T022 [US3] (Pilar) Write `apps/backend/tests/integration/db/routing-rate-limiter.integration.test.ts` RED — spec test 37b (capacity/refill, 26th with `maxWaitMs 0/3000`, two Prisma connections → exactly 25 of 30, `drain`, independent buckets).
- [ ] T023 [US3] (Pilar) Implement `apps/backend/src/modules/day-plan/infrastructure/routing/postgres-routing-rate-limiter.ts` — atomic `UPDATE … RETURNING` with `clock_timestamp()`, 250 ms poll to `maxWaitMs`, `drain`. Turn T022 GREEN.
- [ ] T024 [US3] (Pilar) Add tests for `DynamicRoutingService` to a `dynamic-providers` test file RED — spec tests 43, 43a (N5: hub token wins, no `MAPBOX_ACCESS_TOKEN` ref under `routing/`), 43b (kill switch; invalid value fails boot).
- [ ] T025 [US3] (Pilar) Implement `DynamicRoutingService` in `apps/backend/src/modules/integration/infrastructure/dynamic-providers.ts` (mirror `DynamicGeocodingService`: resolve `mapbox` per call, cache per token; receive limiter + provider mode; `stub` forces the stub). Turn T024 GREEN.
- [ ] T026 [US3] (Pilar) Add `DAY_PLAN_ROUTING_PROVIDER` (`mapbox|stub`, default `mapbox`) to the backend env validation with the boot error message, and document it in `apps/backend/.env.example`.

**Checkpoint**: US3 shippable — two machines respect the quota; the provider can be killed without stopping routing.

## Phase 6: User Story 4 — Per-stop service-type duration (P2) · (Pilar)

**Goal**: `default_duration_minutes` validated, persisted, audited, on the API, backfilled idempotently. **Independent test**: `pnpm --filter @properfy/shared test service-type` + `pnpm --filter backend test service-type` + `pnpm --filter backend test:integration:db service-type-duration-backfill`.

- [ ] T027 [US4] (Pilar/Esteio) `packages/shared/src/constants/service-type.ts` (min/max/default) + extend `packages/shared/src/schemas/service-type.ts` (`createServiceTypeSchema` `.default(45)`, `updateServiceTypeSchema` `.optional()`) and `schemas/responses.ts` `serviceTypeResponseSchema` (check `.extend()` consumers first). Write/extend `schemas/service-type.test.ts` (spec test 23) RED→GREEN.
- [ ] T028 [US4] (Pilar) Thread `defaultDurationMinutes` through `apps/backend/src/modules/service-type/` — `domain/service-type.entity.ts` (grep `new ServiceTypeEntity(` in tests first), repo mapping, create/update/get/list use cases + audits; write/extend `create-service-type.use-case.test.ts` (test 24) and `update-service-type.use-case.test.ts` (test 25) RED→GREEN.
- [ ] T029 [US4] (Pilar) Service-type routes already validate the shared schema; extend `interfaces/service-type.routes.test.ts` (supertest, test 26: POST 60→201, POST 3→400, GET/list carry it, PATCH 481→400) RED→GREEN; regenerate contract (`pnpm generate:api`).
- [ ] T030 [US4] (Pilar) Write `apps/backend/tests/integration/db/service-type-duration-backfill.integration.test.ts` RED (test 27: 62'→60, <10 samples→45, out-of-range→45, abandoned excluded, idempotent); ensure the migration backfill block (T007) makes it GREEN; confirm test 28 (direct `INSERT` without the column still works) via existing integration tests.

**Checkpoint**: US4 shippable — every service type has a bounded, measured duration on the API.

## Phase 7: Integration & wiring · (Pilar)

- [ ] T031 (Pilar) Wire `apps/backend/src/main/container.ts` — `routingRateLimiter = new PostgresRoutingRateLimiter(prisma)`, `routingService = new DynamicRoutingService(integrationConfigResolver, routingRateLimiter, providerMode)`, `planRouteService = new PlanRouteService(routingService, logger, metrics)`; expose at `container.dayPlan.planRouteService`. (depends on T004–T026)

## Phase 8: Polish & cross-cutting

- [ ] T032 [P] (Pilar) `apps/backend/CLAUDE.md`: remove the N5 "created by F04" transition clause (§10 "Routing") and add a short routing-engine note; `grep "created by F04" apps/backend/CLAUDE.md` empty.
- [ ] T033 [P] (Pilar) `packages/shared/CLAUDE.md` + confirm root `CLAUDE.md` F04-1 entry are accurate to what shipped.
- [ ] T034 (Pilar) Run the full gate set inside the worktree (quickstart.md): shared test/typecheck/lint/build; backend typecheck/lint/test (unit + integration) + db suite; `pnpm generate:api` freshness; web + pwa typecheck; `grep` checklist; `git diff --stat origin/develop...` < 150 files. Commit (Conventional, two authors, no Claude/AI refs), push, open PR to `develop`.

## Dependencies & order

- **Setup (T001–T003)** → **Foundational (T004–T008)**: T004 (shared types) unblocks US1 **and** US2; T005–T006 (ports) unblock US2/US3; T007 (schema/migrations) unblocks US3/US4 db tests; T008 (metrics) unblocks US2/US3.
- **US1 (T009–T016, Esteio)** depends only on T004; runs in parallel with Pilar's US2/US3/US4.
- **US2 (T017–T021, Pilar)** depends on T004 (optimizer types + eventually impl in `dist/`), T005, T008. T021 (`PlanRouteService`) needs the optimizer available in the shared `dist/` — so T016 (Esteio's `build`) must land before T021's green run; the test (T020) can be written against the contract earlier.
- **US3 (T022–T026)** depends on T006, T007 (bucket table), T008.
- **US4 (T027–T030)** depends on T007 (migration/backfill).
- **Wiring (T031)** depends on T021, T023, T025, T026.
- **Polish (T032–T034)** last; T034 is the real correctness gate before the PR.

## Parallel opportunities

- Pilar and Esteio work the same worktree concurrently after T004: Esteio on `packages/shared/src/route-planning/`, Pilar on `apps/backend/src/modules/day-plan/` + `service-type` + `integration`.
- Within Pilar's work, US2, US3 and US4 touch disjoint files and can interleave; `[P]` tasks (T005/T006/T008, T019, T032/T033) are independent.

## MVP

US1 (the optimizer) + US2 (adapter + `PlanRouteService`) is the functional core TASK-F04-2 consumes. US3 (shared limiter/kill switch) and US4 (duration) are required for this PR to merge but are independently testable.
