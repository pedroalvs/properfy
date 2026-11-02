# Implementation Plan: Service-type duration, routing port, pure route optimizer and PlanRouteService (TASK-F04-1)

**Branch**: `051-f04-1-routing-optimizer` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/051-f04-1-routing-optimizer/spec.md`

## Summary

Deliver the F04 routing engine as a "dark" backend + shared slice: a per-stop `ServiceType.default_duration_minutes` (NOT NULL, 5–480, defaulted/backfilled), a pure I/O-free route optimizer in `packages/shared` (exact ≤ 8 stops, nearest-feasible + 2-opt above, deterministic), an `IRoutingService` port with a Mapbox adapter (Matrix for ordering, Directions v5 with per-leg `depart_at` for ETAs/geometry), a haversine stub, a `DynamicRoutingService` resolving the Integrations-Hub `mapbox` config per call, a Postgres-backed shared Mapbox rate limiter (one token bucket per profile, serialized across both Fly machines), a provider kill switch (`DAY_PLAN_ROUTING_PROVIDER`), a per-code provider-failure metric, and the `PlanRouteService` orchestrator (matrix → optimize → final Directions pass → geometry; interactive stub fallback vs. strict job-mode deferral). No new HTTP route ships except the duration field on the existing service-type routes; TASK-F04-2 is the consumer.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict, ES2022 ESM); Node.js 24; pnpm 9 + Turborepo
**Primary Dependencies**: Backend — Fastify 4, Prisma 6 (PostgreSQL/Supabase; PostGIS in CI), Zod 3, pg-boss 9, native `fetch` + `AbortController`, existing `CircuitBreaker` (`shared/infrastructure/circuit-breaker.ts`). Shared — none new (the optimizer is dependency-free and MUST NOT import from Node, because it is bundled into the PWA).
**Storage**: PostgreSQL. One new column `service_types.default_duration_minutes` (expand-only, `DEFAULT 45`, SQL CHECK 5–480) and one new table `routing_rate_limit_buckets` (no `tenant_id`). No day-plan tables here (TASK-F04-2).
**Testing**: Vitest (shared optimizer; backend unit — adapters, dynamic, `PlanRouteService`), Supertest (service-type routes), testcontainers (db suite — backfill, `routing-rate-limiter`, service-type uniqueness). TZ-dependent tests pin `TZ=America/Los_Angeles`.
**Target Platform**: Fly.io (API, all environments; 2 machines under load), consumed by backend jobs (F04-2) and the PWA optimizer (Part B).
**Project Type**: Monorepo — backend module (`apps/backend/src/modules/day-plan`, new) + shared library slice (`packages/shared/src/route-planning`, new) + service-type touch-ups.
**Performance Goals**: Optimizer — 24 stops (heuristic) < 200 ms, 8 stops (exact) < 300 ms. Limiter — 1 `UPDATE` per Mapbox call (≤ ~10 per plan). Interactive deadline 12 s, job deadline 60 s.
**Constraints**: Access token never logged or embedded (test reads the source); Mapbox limits respected cluster-wide (per token = per environment); pure-expand migration (no table rewrite); PR ≤ 150 files (estimated ~50).
**Scale/Scope**: Real inspector days are 3–4 stops (`inspector-workload.ts`), so the exact search is the common path; the heuristic covers the long tail. Three rate buckets.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Clean Architecture (NON-NEGOTIABLE)** — PASS. `IRoutingService`/`IRoutingRateLimiter` ports live in `modules/day-plan/domain/`; the Mapbox/stub/Postgres adapters in `infrastructure/`; `PlanRouteService` in `application/services/`; `DynamicRoutingService` in `modules/integration/infrastructure/` (mirrors `DynamicGeocodingService`). The shared optimizer is a pure domain library (no deps). Dependencies point inward; no layer violation. No `interfaces/` layer touched except the existing service-type routes.
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — PASS with a **documented exception**. `routing_rate_limit_buckets` has **no `tenant_id`**: it is platform infrastructure (one Mapbox token per environment), precedent `cron_job_runs`/`IntegrationSetting`. Routing/day plan is per-inspector (cross-tenant, D10/D11); this task exposes no agency-facing routing route, so scope is guaranteed by construction. The only tenant-touching surface is the service-type duration field on existing AM-only-create / public-read routes with **unchanged RBAC**. No business query gains or loses a tenant predicate. Recorded in spec Assumptions per §7.1.
- **III. Test-Driven Development (NON-NEGOTIABLE)** — PASS. Every unit in the spec's "Tests first" list (optimizer 1–22, duration 23–28, Mapbox 29–40b, stub/dynamic 41–43b, `PlanRouteService` 44–54) is written red before green. Integration (testcontainers) for the backfill and the two-connection limiter race. No Prisma mock in the db suite.
- **IV. Contract-First APIs (NON-NEGOTIABLE)** — PASS. The only wire change is `defaultDurationMinutes` on the service-type schemas in `packages/shared`; `pnpm generate:api` regenerates `openapi.json` + `api-types.ts`, both committed (CI `contract-freshness`). No ad-hoc types; the ports and optimizer types are shared/domain TS, not an HTTP contract.
- **V. Simplicity and Minimal Impact** — PASS. No feature flag beyond the operational kill switch the task mandates; no speculative abstraction; the Google adapter and Optimization API are explicitly out of scope; dead code none. The optimizer is the least engine that meets 01.A3/00.A5 with provable optimality on the common path.

**Quality gates (Development Workflow)**: lint + typecheck + unit/integration (shared, backend) + db suite + `generate:api` freshness, all inside the worktree before PR; branch off `develop`; one migration per PR (timestamp regenerated on rebase); Conventional Commits, no Claude/AI references.

**No gate violations — proceeding to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/051-f04-1-routing-optimizer/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (ports + route delta)
│   ├── routing-service.contract.md
│   ├── route-optimizer.contract.md
│   └── service-type-routes.delta.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── route-planning/                     # NEW — pure optimizer (Esteio)
│   ├── types.ts                        # contract: weights, stops, input, evaluation, result, errors
│   ├── haversine.ts                    # haversineMeters (R = 6371008.8)
│   ├── matrix-profile.ts               # selectMatrixProfile
│   ├── evaluate-sequence.ts            # evaluateSequence + forward slack
│   ├── compare.ts                      # compareEvaluations, toWeightTenths
│   ├── optimize-route.ts               # optimizeRoute (exact DFS + heuristic 2-opt)
│   ├── insert-into-order.ts            # insertIntoOrder (cheapest insertion)
│   ├── index.ts                        # barrel
│   └── route-optimizer.test.ts         # Vitest (Esteio)
├── constants/service-type.ts           # NEW — duration min/max/default
├── schemas/service-type.ts             # EDIT — defaultDurationMinutes
├── schemas/service-type.test.ts        # EDIT/NEW cases
├── schemas/responses.ts                # EDIT — serviceTypeResponseSchema
├── api-types.ts                        # REGENERATED
└── index.ts                            # EDIT — export route-planning + constants

apps/backend/
├── prisma/schema.prisma                # EDIT — default_duration_minutes; RoutingRateLimitBucket
├── prisma/migrations/
│   ├── <ts>_service_type_default_duration/migration.sql   # NEW (+ backfill block)
│   └── <ts>_routing_rate_limit_buckets/migration.sql      # NEW (CREATE + seed 3 rows)
├── src/modules/day-plan/               # NEW module (this task: routing only)
│   ├── domain/routing.service.ts                 # IRoutingService, errors
│   ├── domain/routing-rate-limiter.ts            # IRoutingRateLimiter, buckets
│   ├── infrastructure/routing/mapbox-routing.service.ts
│   ├── infrastructure/routing/stub-routing.service.ts
│   ├── infrastructure/routing/postgres-routing-rate-limiter.ts
│   ├── infrastructure/routing/__tests__/mapbox-routing.service.test.ts
│   └── application/services/plan-route.service.ts (+ __tests__/)
├── src/modules/integration/infrastructure/dynamic-providers.ts  # EDIT — DynamicRoutingService
├── src/modules/service-type/…          # EDIT — entity/repo/use-cases/routes carry duration
├── src/shared/infrastructure/metrics.ts # EDIT — recordRoutingProviderCall
├── src/main/container.ts               # EDIT — wire limiter/service/planRouteService + env
├── src/config/env (or equivalent)      # EDIT — DAY_PLAN_ROUTING_PROVIDER validation
├── .env.example                        # EDIT — DAY_PLAN_ROUTING_PROVIDER
├── CLAUDE.md                           # EDIT — remove N5 "created by F04" clause; add routing
└── tests/integration/db/
    ├── service-type-duration-backfill.integration.test.ts  # NEW
    └── routing-rate-limiter.integration.test.ts            # NEW
```

**Structure decision**: A new backend module `day-plan` owns the routing ports/adapters/orchestrator (TASK-F04-2 extends the same module with persistence). The optimizer is a new shared library slice because the PWA reorder (Part B) re-uses the same evaluator and the constitution requires cross-workspace code to live in `packages/shared`. `DynamicRoutingService` lives beside `DynamicGeocodingService` in the integration module, not in `day-plan`, because it is the Integrations-Hub provider-resolution pattern.

## Complexity Tracking

No constitution deviations requiring justification. The one multi-tenant exception (no `tenant_id` on `routing_rate_limit_buckets`) is a documented platform-scoped precedent, not a violation.

## Phase 0 — Research

See [research.md](./research.md). All decisions are resolved from the task file and verified against the current code; no open `NEEDS CLARIFICATION`. Key resolved items: Mapbox Matrix/Directions URL shapes and the `depart_at ≥ now + 60 s` rule; the token-bucket `UPDATE … RETURNING` with `clock_timestamp()`; the forward-slack `d` formula; the exact-search pruning that never discards an optimum; the dynamic-provider per-call token resolution (N5); the backfill SQL and its ≥ 10-sample / 5–480-min / round-to-5 robustness.

## Phase 1 — Design & Contracts

See [data-model.md](./data-model.md) (schema column, bucket table, optimizer/port types), [contracts/](./contracts/) (the `IRoutingService`/`IRoutingRateLimiter` port, the optimizer public surface, and the service-type route delta), and [quickstart.md](./quickstart.md) (how to run the suites and verify).

**Post-design Constitution re-check**: still PASS. The design adds no layer violation (ports in domain, adapters in infrastructure, orchestration in application), no new tenant-scoped query, and one documented platform-scoped table. Contract regeneration is the only wire change.
