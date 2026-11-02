# Feature Specification: Service-type duration, routing port (Mapbox + stub + dynamic), pure route optimizer and PlanRouteService

**Feature Branch**: `051-f04-1-routing-optimizer`
**Created**: 2026-11-02
**Status**: Draft
**Input**: TASK-F04-1 of `fase2-etapa1/tarefas/F04-tarefas.md` — backend + shared domain base of F04 "Day plan and route". Contract 01.1 (routing engine) + B5 (service-type duration); criteria **01.A3** and **00.A5** (the base address is the origin of the computation).

## Overview

This is the first, foundational slice of F04 (Day plan and route) and sits on the critical path. It delivers the **routing engine** that the day plan (TASK-F04-2), the printed route sheet, the per-stop ETAs (F06) and the reliability metric (F07) all build on. It is a **"dark" task**: nothing new is exposed over HTTP except a duration field on the existing service-type routes. TASK-F04-2 is the first consumer.

It delivers five capabilities:

1. **Per-stop duration as a property of the service type** — `ServiceType.default_duration_minutes` (NOT NULL in the database, 5–480, defaulted to 45 and backfilled from measured execution durations). The optimizer adds this to travel time at each stop.
2. **A pure route optimizer in the shared package** (`packages/shared/src/route-planning/`) — a deterministic, I/O-free engine (`evaluateSequence`, `optimizeRoute`, `insertIntoOrder`, `compareEvaluations`, `haversineMeters`, `selectMatrixProfile`) usable by both the backend and the PWA (the PWA re-uses the same evaluator for local reorder recomputation in the Part B tasks).
3. **A routing provider port (`IRoutingService`)** with a Mapbox adapter (Matrix for ordering only; Directions v5 with per-leg `depart_at` for final ETAs and geometry), a haversine **stub**, and a `DynamicRoutingService` that resolves the `mapbox` config from the Integrations Hub on every call.
4. **A shared, Postgres-backed Mapbox rate limiter** (`IRoutingRateLimiter` + `PostgresRoutingRateLimiter`) — a token bucket serialized across the two Fly machines (workers run in the API process), so the per-token/per-environment Mapbox limits are respected cluster-wide, plus an explicit provider **kill switch** (`DAY_PLAN_ROUTING_PROVIDER=mapbox|stub`) and a per-code provider-failure counter in `/metrics`.
5. **The `PlanRouteService` orchestrator** — matrix → optimization → final Directions pass → geometry, with a stub fallback and an "Approximate route" flag in interactive mode, and a strict (job) mode that defers instead of silently degrading on rate-limit/deadline.

No day-plan persistence, jobs or HTTP routes ship here (TASK-F04-2). No web duration UI ships here (TASK-F04-5), which is why the schema default (`45`) is transitional.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The optimizer produces a sensible, deterministic route starting from the base (Priority: P1)

Given an inspector's base address and a set of scheduled stops each with a hard time window and a per-type service duration, the engine returns a visiting order that starts from the base, keeps every window it can, and — all else equal — puts the stop closest to the base first. The result is fully deterministic (same input, byte-identical output) and, for small days (≤ 8 stops), provably optimal (equal to brute force). When a window simply cannot be met, it reports the best-effort order with the violations rather than refusing.

**Why this priority**: This is the heart of 01 and the subject of criteria 01.A3 and 00.A5. Everything else in F04 (persistence, ETAs, the route sheet, the metric) is a consumer of this order and these timings; without it nothing in F04 can be built.

**Independent Test**: Run `optimizeRoute` on the documented "line" matrix fixtures and assert the exact order, cost, departure/finish times and feasibility; assert `EXACT == brute force` over seeded random 6-stop instances and `HEURISTIC ≥ greedy` over seeded 9–12-stop instances; assert identical output across shuffled inputs. All verifiable in the shared Vitest suite with no I/O.

**Acceptance Scenarios**:

1. **Given** base O and colinear stops A, B, C all open 08:00–17:00, **When** `optimizeRoute` runs, **Then** the order is `A, B, C` (closest-to-base first), `method: 'EXACT'`, departure 07:50, cost `2400`, `feasible: true`, finish 10:35 (**01.A3 / 00.A5**).
2. **Given** the same stops but C restricted to 08:00–08:30, **When** it runs, **Then** the earlier hard window wins: order `C, B, A`, cost `4800`, `feasible: true` (01.A3 exception).
3. **Given** two consecutive stops at the same coordinate (a going-in + a coming-out at one property), **When** the final pass runs, **Then** that leg is `travelS 0`, `distanceM 0`, no Directions call and no geometry feature, while the leg remains `approximate: false` (L-F04-13).
4. **Given** a sequence whose earliest-possible departure creates "phantom wait" (arrive early, wait for a later window), **When** it is evaluated, **Then** the forward-slack step delays departure by the largest amount that increases no lateness, so only unavoidable waits remain.
5. **Given** 9 or more stops, **When** it runs, **Then** `method: 'HEURISTIC'` (nearest-feasible + 2-opt), never worse than the greedy construction; at 8 stops `method: 'EXACT'`.
6. **Given** no origin (`originIndex: null`), **When** it runs, **Then** the first stop starts at its own window, `departureS: null`, and there is no origin leg (D7).

### User Story 2 - The provider adapter returns real travel data and never leaks the token, degrading safely (Priority: P1)

The Mapbox adapter asks the Matrix API for pairwise travel times to decide the order and the Directions API (with a per-leg departure time) for the final ETAs and the map line. It picks the traffic profile when the coordinate count allows it, aborts slow calls, surfaces every failure as a typed error, and never writes the access token to a log or an error message. When Mapbox is unavailable or over budget, an interactive computation falls back to a straight-line stub and flags the plan "approximate"; a background job instead defers (so a rate-limited plan is retried, never silently wrong).

**Why this priority**: The engine is useless without real travel data, and a leaked token or a hard dependency on a flaky upstream would be a security and availability defect. Safe degradation (criterion: Mapbox failure never breaks the interactive computation) is a release gate.

**Independent Test**: With `fetch` mocked, assert the exact Matrix/Directions URLs, profile selection, `depart_at` rule, timeouts, token redaction across every error path, the typed error codes, and that interactive fallback yields a stub + `approximate` while strict (job) mode throws `RoutingDeferredError`.

**Acceptance Scenarios**:

1. **Given** 3 points, **When** `matrix` is called, **Then** the URL is the `directions-matrix/v1/mapbox/driving-traffic/{lng,lat;…}?annotations=duration,distance&access_token=…` form with lng,lat order and 6 decimals, and durations/distances parse to integers.
2. **Given** 11 points the profile is `driving`; **Given** 26 points, **Then** `matrix` throws `RoutingProviderError('TOO_MANY_COORDINATES')` without calling `fetch`.
3. **Given** `directions([from,to], { departAt })` with `departAt ≥ now + 60 s`, **When** called, **Then** the URL carries `depart_at=YYYY-MM-DDThh:mm:ssZ` (UTC, seconds zeroed); **Given** `departAt < now + 60 s` or in the past, **Then** the parameter is omitted (current traffic).
4. **Given** an HTTP 429/401/500 or a body `code !== 'Ok'`, **When** it is handled, **Then** a `RoutingProviderError` with code `HTTP_429`/`HTTP_401`/`HTTP_500`/`PROVIDER_CODE_<code>` is raised; a 429 also drains the shared bucket for all instances.
5. **Given** any error path, **When** the error and logs are produced, **Then** no log call and no error message contains `access_token` or the token value, and each call emits a `routing.provider_call` log and increments the metrics, including `routingProviderFailuresByCode[code]` for non-OK outcomes (L-F04-09).
6. **Given** Mapbox throws in interactive mode, **When** `PlanRouteService.compute` runs, **Then** it uses the stub (straight line), marks the plan `approximate: true` with an `approximateReason`; **Given** strict (job) mode with a rate-limit/deadline/provider error, **Then** it throws `RoutingDeferredError` and writes nothing.

### User Story 3 - The Mapbox budget is respected across both Fly machines, with a kill switch (Priority: P2)

Because the publication workers run inside the API process and Fly can run a second machine under load, the Mapbox call budget is enforced in Postgres, not per process — the two machines draw from one shared token bucket per profile, so the real call rate stays under Mapbox's per-token (per-environment) ceiling. An operator can turn the provider off entirely (`DAY_PLAN_ROUTING_PROVIDER=stub`) without stopping the day-plan job, and per-code provider failures are visible in `/metrics`.

**Why this priority**: This is the production-safety control that lets F04-2 go live. It is testable here but only exercised by the job in F04-2, so it ranks just below the engine and adapter.

**Independent Test**: With two distinct Prisma connections contending for 30 acquisitions against a 25-capacity bucket, exactly 25 succeed (atomic `UPDATE … RETURNING`); `drain` empties the bucket; buckets are independent; `DAY_PLAN_ROUTING_PROVIDER=stub` makes the dynamic service never call `fetch`; an invalid value fails the boot.

**Acceptance Scenarios**:

1. **Given** a `matrix:driving-traffic` bucket (capacity 25, refill 25/60 s), **When** 25 immediate `acquire`s are made, **Then** all return `true`; the 26th with `maxWaitMs 0` returns `false`; with `maxWaitMs 3000` and the database clock advanced 2.4 s it returns `true`.
2. **Given** two distinct Prisma connections (simulating two machines) racing 30 `acquire`s in parallel, **When** they run, **Then** exactly 25 return `true` (atomicity of the single `UPDATE … RETURNING`).
3. **Given** a provider 429, **When** the adapter handles it, **Then** it calls `drain(bucket)` so every instance backs off; `directions` and `matrix:*` buckets are independent.
4. **Given** `DAY_PLAN_ROUTING_PROVIDER='stub'` with a `mapbox` config present, **When** matrix/directions run, **Then** they answer with `provider 'STUB'` and `fetch` is never called; `'google'` (invalid) fails the boot with the message `DAY_PLAN_ROUTING_PROVIDER must be 'mapbox' or 'stub'`.

### User Story 4 - Each service type carries a measured, bounded per-stop duration (Priority: P2)

Every service type has a default duration in minutes (5–480). New or unmeasured types default to 45; types with enough finished executions are backfilled to their measured average (rounded to 5-minute multiples, abandoned executions excluded). The field appears on the service-type API responses, is validated, and is audited on create/update — but the web form that makes it required ships later (TASK-F04-5).

**Why this priority**: The optimizer needs a per-stop service time and the contract calls for a configurable duration, but it is data, not an algorithm, so it ranks below the engine. The transitional `.default(45)` keeps the ~15 existing direct `INSERT`s and the create route working until F04-5.

**Independent Test**: Schema accepts 5/45/480 and rejects 4/481/45.5/`'45'`/`null`; missing → 45; create/update persist and audit the field; the route POST/PATCH/GET carry it; the migration backfill block run over seeded data yields the documented values and is idempotent.

**Acceptance Scenarios**:

1. **Given** `POST /v1/service-types` with `defaultDurationMinutes: 60`, **When** an AM creates it, **Then** it returns 201 with `defaultDurationMinutes: 60` and audits `service_type.created` with `after.defaultDurationMinutes`; `3` returns 400 `VALIDATION_ERROR`; missing → 45.
2. **Given** `PATCH /v1/service-types/:id` 45 → 60, **When** applied, **Then** it persists and audits `before 45`/`after 60`; omitting the field changes nothing; `481` returns 400.
3. **Given** a type with 12 finished executions averaging 62 min, **When** the backfill block runs, **Then** its duration becomes 60 (rounded to 5); a type with 9 executions stays 45 (< 10 samples); abandoned executions and durations outside 5–480 min are excluded; running the block twice gives the same result (idempotent).
4. **Given** an existing `INSERT INTO service_types (...)` without the column, **When** it runs after the migration, **Then** it still works (`DEFAULT 45`).

### Edge Cases

- **0 stops**: empty result, no provider call. **1 stop**: no Matrix; one Directions only if there is an origin; no origin + 1 stop → no call.
- **10+ coordinates**: Matrix `driving` profile; **≥ 9 stops**: heuristic. Profile (by coordinate count) and method (by stop count) are independent.
- **> 25 coordinates**: stub for the order, `approximate: true`.
- **Mapbox down / 401 / 429 / timeout / circuit open**: interactive → stub (straight line) + `approximate` with reason; job (strict) → `RoutingDeferredError`, never silently approximate on 429/limit.
- **No `mapbox` config (dev/CI)**: always stub → `approximate: true`, `approximateReason 'NO_PROVIDER'` (even in the job).
- **Window end ≤ start** (bad data): end treated as start (only an exactly punctual arrival is on time).
- **`depart_at` under 60 s away or in the past** (afternoon recompute): parameter omitted (current traffic).
- **Unavoidable wait** (a window closing early before one opening late): forward slack stops at the window edge; the remaining wait appears and enters the cost.
- **Two Fly machines calling at once**: the Postgres limiter splits the quota (test 37b).
- **DST and per-agency timezones**: per-stop conversion in the appointment's agency timezone; durations in real seconds; a Perth and a Sydney stop in one plan are ordered by instant.
- **Stop without a coordinate** (geocoding pending): participates as time only; the plan is `approximate`; no geometry feature for it.
- **Two stops at one property / one geocoding** (L-F04-13): a 0 s leg with no Directions call and no degenerate `LineString`.
- **Service groups** (L-F04-11): stops of the same or different groups are independent; the optimizer and `PlanRouteStopInput` carry no group field; interleaving is expected; the window is always the appointment's `time_slot_start/end`, never the group's `time_window`.
- **All weights zero**: allowed by the optimizer (tie-breakers decide); the setting validation (TASK-F04-2) prevents saving it.
- **Token revoked / quota / billing (401/402/403) for days** (L-F04-09): each call counts in `routingProviderFailuresByCode`; the operator can force `DAY_PLAN_ROUTING_PROVIDER=stub` without stopping the job; the circuit breaker stays at 60 s.

## Requirements *(mandatory)*

### Functional Requirements

**Service-type duration (B5 / D6)**

- **FR-001**: `ServiceType` MUST gain a non-null `default_duration_minutes` (integer, range 5–480 enforced by a SQL CHECK, database `DEFAULT 45`). The column MUST NOT appear in `schema.prisma` as a CHECK (Prisma does not model it) and MUST NOT cause drift; the migration MUST be pure-expand (NOT NULL with a constant default, no table rewrite on Postgres 11+).
- **FR-002**: The migration MUST include an **idempotent backfill** block (delimited `-- backfill:begin`/`-- backfill:end`) that sets the duration to the measured average over finished `inspection_executions` (same source as `avgExecutionMinutes`), excluding abandoned executions and durations outside 5–480 min, requiring **≥ 10 samples**, rounded to multiples of 5 and clamped to 5–480; types with too few samples keep 45. `abandoned_at` (from TASK-F03-2) is a hard dependency.
- **FR-003**: The shared schemas MUST carry `defaultDurationMinutes`: `createServiceTypeSchema` as `z.number().int().min(5).max(480).default(45)` (transitional default until TASK-F04-5), `updateServiceTypeSchema` as the same but `.optional()`, and `serviceTypeResponseSchema` as `z.number().int()`. Constants `SERVICE_TYPE_DURATION_MIN_MINUTES = 5`, `..._MAX_MINUTES = 480`, `..._DEFAULT_MINUTES = 45` MUST live in a new `packages/shared/src/constants/service-type.ts`.
- **FR-004**: The service-type entity, repository mapping and create/update/get/list use cases MUST carry `defaultDurationMinutes`; create/update MUST include it in the `service_type.created`/`service_type.updated` audits (before/after). RBAC MUST be unchanged (create/update AM-only; reads as today).
- **FR-005**: `POST`/`PATCH /v1/service-types` MUST accept the field; `GET`/`GET/:id`/list MUST return it as `defaultDurationMinutes: number`. The regenerated `openapi.json` and `api-types.ts` MUST be committed.

**Pure optimizer (shared — D5)**

- **FR-006**: The shared package MUST expose a deterministic, I/O-free optimizer under `packages/shared/src/route-planning/` with no new dependency and **no import from Node** (it is bundled into the PWA): `evaluateSequence`, `optimizeRoute`, `insertIntoOrder`, `compareEvaluations`, `toWeightTenths`, `haversineMeters` (R = 6371008.8 m), `selectMatrixProfile`, the types in the contract, and `RouteOrderMismatchError` (`code 'ROUTE_ORDER_MISMATCH'`), all re-exported from `packages/shared/src/index.ts`.
- **FR-007**: `evaluateSequence` MUST compute per-stop arrival/service/wait/late and plan departure/finish for a given order, treating windows as hard for the arrival/start, supporting an optional `legTravelS` override (the final Directions pass) and an `earliestDepartureS` floor (today's plans). It MUST apply **forward slack**: after the earliest-departure pass it delays departure (or the first stop's start, without origin) by the largest integer `d` that increases no stop's lateness, removing phantom wait, never moving earlier than `earliestDepartureS`. An order with a repeated/missing/unknown key MUST throw `RouteOrderMismatchError`.
- **FR-008**: The cost MUST be the integer `costTenths = W_t·totalTravelS + W_w·totalWaitS + W_b·firstLegS` with `W = round(weight × 10)` (`toWeightTenths`); `travel` is the whole displacement origin→…→last (no return to base), `windowWait` the sum of window waits, `baseProximity` the first origin leg. `compareEvaluations` MUST order by `(totalLateS, costTenths, finishS, lexicographic by canonical rank)` where the canonical rank is `(windowStartS asc, key asc)`.
- **FR-009**: `optimizeRoute` MUST choose the method by stop count: `TRIVIAL` for 0–1, **exact DFS** for 2–8 (`ROUTE_OPTIMIZER_EXACT_MAX_STOPS = 8`; provably equal to brute force; pruning that never discards a possible optimum), **nearest-feasible + 2-opt** (`HEURISTIC`) for ≥ 9 (first-improvement 2-opt, max 50 sweeps, never worse than the greedy construction). `forceMethod` MUST exist for tests only. Output MUST be identical across shuffled inputs and repeated runs.
- **FR-010**: `insertIntoOrder` MUST implement cheapest-insertion over a prior manual order filtered to surviving stops, inserting each new key (canonical order) at the `(totalLateS, costTenths, finishS)`-minimizing position, earliest position on a tie; `method 'INSERTION'` (or `'FIXED'` when nothing is new).
- **FR-011**: Infeasibility MUST be reported, not corrected: when no order meets every window, the lowest-total-lateness order is returned with `feasible: false` and `violations` (stops with `lateS > 0`). Service groups MUST NOT constrain the order (no group field in `OptimizerStop`/`PlanRouteStopInput`); a stop without a coordinate (`matrixIndex: null`) consumes time only and does not affect feasibility by itself.
- **FR-012**: `haversineMeters` MUST return 0 for identical points and 111195 ± 1 m for `(0,0)→(0,1)`; `selectMatrixProfile` MUST return `'driving-traffic'` for ≤ 10 coordinates, `'driving'` for 11–25, and `null` for 26+ (the caller then uses the stub). Performance: 24 stops (heuristic) < 200 ms, 8 stops (exact) < 300 ms.

**Routing port and adapters (D4 / N5)**

- **FR-013**: A `modules/day-plan/domain/routing.service.ts` MUST define the `IRoutingService` port (`matrix(points, opts)` for ordering only — never final ETAs — and `directions(points, opts & { departAt })` for a fixed-order leg), the `RoutingProviderError` (codes `TIMEOUT | RATE_LIMITED | CIRCUIT_OPEN | TOO_MANY_COORDINATES | HTTP_${number} | PROVIDER_CODE_${string} | NETWORK`), and `RoutingDeferredError` (`reason 'RATE_LIMITED' | 'DEADLINE' | 'PROVIDER_ERROR'`). A `modules/day-plan/domain/routing-rate-limiter.ts` MUST define `IRoutingRateLimiter` (`acquire(bucket, maxWaitMs)` polling every 250 ms, `drain(bucket)`) and the `RoutingRateBucket` union.
- **FR-014**: `MapboxRoutingService` MUST build the documented Matrix and Directions v5 URLs (profile from `selectMatrixProfile`; `null` → `TOO_MANY_COORDINATES`), send `depart_at` **iff** `departAt ≥ now + 60 s` (UTC, seconds zeroed), abort on 8000 ms (matrix) / 5000 ms (directions) → `TIMEOUT`, parse durations/distances to integers and geometry coordinates to 5 decimals, map null matrix pairs into `nullPairs`, and raise typed errors for non-OK HTTP and body codes. It MUST acquire the shared limiter before each `fetch`, `drain` on a provider 429, and sit behind a per-process `CircuitBreaker` (`mapbox-routing`, 5 failures, 60 s) shared by both calls. It MUST NOT retry internally. It MUST NOT read `MAPBOX_ACCESS_TOKEN` (or `env`) directly — the token comes from the dynamic service per call (N5). No code path may log or embed the token (test reads the source for `MAPBOX_ACCESS_TOKEN` under `modules/day-plan/infrastructure/routing/`).
- **FR-015**: `StubRoutingService` MUST compute `durationS = round(haversine × 1.3 / (40 km/h))` and `distanceM = round(haversine × 1.3)` with profile `'haversine'`, provider `'STUB'`, and a straight `LineString [from, to]` for directions (constants `STUB_ROAD_FACTOR = 1.3`, `STUB_SPEED_MPS = 40/3.6`).
- **FR-016**: `DynamicRoutingService` (in `modules/integration/infrastructure/dynamic-providers.ts`, mirroring `DynamicGeocodingService`) MUST resolve `resolver.getConfig('mapbox')` on **every** call (null → stub; otherwise a `MapboxRoutingService` cached per `accessToken`, new token → new instance, circuit breaker preserved on an unchanged token) and receive the shared limiter and the provider mode. `DAY_PLAN_ROUTING_PROVIDER='stub'` MUST force the stub without reading the `mapbox` config; the env MUST be validated at boot (`mapbox|stub`, default `mapbox`) and documented in the backend `.env.example`.

**Shared rate limiter (D16 / D17)**

- **FR-017**: A new `routing_rate_limit_buckets` table MUST hold one row per bucket (`bucket` PK, `tokens Decimal(10,4)`, `capacity Int`, `refill_per_minute Int`, `refilled_at DateTime default now()`), seeded with the three buckets at `tokens = capacity` (`matrix:driving-traffic` 25/25, `matrix:driving` 50/50, `directions` 250/250 — all below Mapbox's 30/60/300 per-minute ceilings). It MUST have **no `tenant_id`** (platform infrastructure, like `cron_job_runs`); Prisma model `RoutingRateLimitBucket @@map("routing_rate_limit_buckets")`.
- **FR-018**: `PostgresRoutingRateLimiter` MUST implement the token bucket in one atomic `UPDATE … RETURNING` using the **database** clock (`clock_timestamp()`), granting a token only when the refilled balance is ≥ 1; a 0-row result means wait 250 ms and retry until `maxWaitMs`, then return `false`. `drain` MUST set `tokens = 0, refilled_at = clock_timestamp()`. The row lock MUST serialize the two Fly machines; each environment has its own database and its own tokens.

**PlanRouteService orchestrator**

- **FR-019**: `PlanRouteService.compute(input)` MUST normalize instants to integer epoch seconds and `serviceMinutes × 60`, build the matrix point list `[origin?] + reorderable-stops-with-coordinate`, and produce the `PlanRouteResult` contract. In `OPTIMIZE`/`PRESERVE_ORDER` with ≥ 2 coordinate stops it MUST call `matrix` (or reuse `cachedMatrix`); a Matrix failure or `TOO_MANY_COORDINATES` MUST fall back to the stub matrix with `approximate`. `FIXED_ORDER` MUST validate the given order (`RouteOrderMismatchError`) and call no Matrix (using `cachedMatrix` if present).
- **FR-020**: The **final Directions pass** MUST walk the chosen order and call `directions([from,to], { departAt })` per coordinate leg — `departAt` for the first leg is the matrix-evaluated departure (with forward slack), for the rest the previous service end on the **recomputed** Directions timeline; the `depart_at` URL rule (≥ now + 60 s) applies. A leg between points `< 10 m` apart (`haversineMeters`) MUST be `travelS 0`, `distanceM 0`, `approximate false`, with **no** Directions call and **no** geometry feature (L-F04-13). The final timeline MUST be `evaluateSequence(input, order, { legTravelS })` with the Directions durations (forward slack re-applied); `legs` MUST carry those adjacent-pair durations.
- **FR-021**: In **interactive** mode (`strict: false`, `maxWaitMs 3000`, deadline 12000 ms) a leg/Matrix failure MUST degrade to the matrix/stub duration + straight line and mark the leg and plan `approximate` with an `approximateReason`; a blown deadline MUST approximate the remaining legs without new calls. In **strict** (job) mode (`strict: true`, 60000/60000) a `RATE_LIMITED`/`HTTP_429`/blown-deadline/provider error MUST throw `RoutingDeferredError` and write nothing — except the permanent cases (`NO_PROVIDER`, `TOO_MANY_COORDINATES`, `NoRoute`/null pair), which MUST still degrade to the stub with `approximate`.
- **FR-022**: Violations and totals MUST come from the **final** timeline (a late finish is reported, not corrected). Geometry MUST be a `FeatureCollection` of per-leg `LineString`s with `properties { fromSequence, toSequence, approximate }` (`fromSequence 0` = origin). `PlanRouteService` MUST emit a coordinate-free, token-free `day_plan.route_computed` log and `routing.fallback`/`routing.too_many_coordinates` logs as applicable, and populate `usage { matrixElements, directionsCalls }`.

**Wiring and metrics**

- **FR-023**: `MetricsCollector.recordRoutingProviderCall({ api, outcome, elements, code? })` MUST accumulate `routingProviderCalls[api][outcome]`, `routingMatrixElements`, and `routingProviderFailuresByCode[code]` for non-OK outcomes, exposed in the `/metrics` snapshot (L-F04-09).
- **FR-024**: The container MUST wire `const routingRateLimiter = new PostgresRoutingRateLimiter(prisma)`, `const routingService = new DynamicRoutingService(integrationConfigResolver, routingRateLimiter, providerMode)` and `const planRouteService = new PlanRouteService(routingService, logger, metrics)`, exposed at `container.dayPlan.planRouteService` for TASK-F04-2.
- **FR-025**: This PR MUST remove the "created by F04" transition clause of rule N5 from `apps/backend/CLAUDE.md` (§10 "Routing") — and make no other change to that file — because it introduces `IRoutingService`.

### Key Entities *(include if feature involves data)*

- **ServiceType (extended)**: gains `default_duration_minutes` (Int, NOT NULL, `DEFAULT 45`, SQL CHECK 5–480). Unchanged tenancy (service types are platform catalog; already no per-row tenant scoping in this task).
- **RoutingRateLimitBucket**: one row per Mapbox bucket (`bucket` PK, `tokens`, `capacity`, `refill_per_minute`, `refilled_at`). **Platform-scoped: NO `tenant_id`** (see Assumptions). Seeded with three rows.
- **Shared optimizer types** (no persistence): `RouteWeights`, `OptimizerStop`, `OptimizerInput`, `EvaluatedStop`, `SequenceEvaluation`, `OptimizationResult`, `OptimizerMethod`; backend ports `IRoutingService`, `IRoutingRateLimiter`, `RoutingMatrix`, `RoutingLeg`; `PlanRouteStopInput`, `PlanRouteMode`, `StoredRoutingMatrix`, `PlanRouteInput`, `PlanRouteResult`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (01.A3)**: The first stop is the one closest to the base unless an earlier hard window forces another order (tests 1 and 2) — green in CI.
- **SC-002 (00.A5)**: The inspector base address is the origin of the computation (`originIndex` = base; tests 1 and 44).
- **SC-003**: The optimizer is deterministic, `EXACT` equals brute force for ≤ 8 stops (test 10), and the heuristic is never worse than greedy for ≥ 9 (test 11).
- **SC-004**: A Mapbox failure never breaks the interactive computation (stub + `approximate` with a reason); in job mode a rate-limit/provider error defers instead of approximating (tests 45–47, 51).
- **SC-005**: Service types have `default_duration_minutes` NOT NULL, 5–480, with an idempotent backfill (test 27) and no drift.
- **SC-006**: No phantom wait — with forward slack only unavoidable waits remain (tests 6 and 6c).
- **SC-007**: The Mapbox budget is respected across instances (test 37b, two connections → exactly 25 of 30).
- **SC-008**: `DAY_PLAN_ROUTING_PROVIDER=stub` turns the provider off without stopping routing, and per-code failures appear in `/metrics` (tests 40b and 43b).
- **SC-009**: Identical points produce no Directions call and no degenerate geometry; service groups never constrain the order (tests 44b and 11b).
- **SC-010**: The access token never appears in any log or error message on any path (test 39).
- **SC-011**: The diff stays within the 150-file PR limit (estimated ~50); `openapi.json` and `api-types.ts` are regenerated and committed; `grep "created by F04" apps/backend/CLAUDE.md` is empty.
- **SC-012 (L-F04-03)**: The Mapbox query (D8) is opened with an owner and a deadline, and the plan B is written in this spec.

## Assumptions

- **Platform-scoped entity exception (premise, CLAUDE.md §7 rule 1 / D10)**: `routing_rate_limit_buckets` deliberately has **no `tenant_id`** because it is platform infrastructure (one Mapbox token per environment, shared by all inspectors/agencies), with the same precedent as `cron_job_runs`, `IntegrationSetting` and global `ServiceRegion`. Routing and the day plan are **per inspector, who is cross-tenant** (D10/D11): `CL_ADMIN`/`CL_USER` never see a plan, and no routing row is per-agency. This task exposes no routing route, so the scope is guaranteed by construction (nothing agency-facing reads the buckets); the one tenant-touching surface, the service-type duration field, is on the existing AM-only create/update + public-read routes whose RBAC is unchanged. The `ServiceType` and `RoutingRateLimitBucket` tenancy is recorded here per the §7.1 documentation rule.
- **Mapbox usage query — owner, deadline, plan B (premise, D8 / L-F04-03)**: the Mapbox commercial-support query with the three D8 questions — (a) cache Directions results during the plan's validity, (b) cache the matrix/durations, (c) pass the raw matrix to the end client — is opened by the F04 lead (Pedro Alves) when this task starts, with a deadline of **the start of TASK-F04-2**; it does **not** block this task. The current design stands (raw matrix in the GET, `routing_matrix_json`/`leg_travel_json` stored). **Plan B** (already designed): if (c) is denied, `routingInput` leaves the contract and reorder uses a server-side preview (`etaSource 'MATRIX'`); if (b) is denied, the matrix/leg JSON is not stored and `PUT /order`/`PRESERVE_ORDER` call Matrix again. The answer is recorded in the TASK-F04-2 PR and in `decisoes.md`.
- **Provider failure visibility (premise, L-F04-09)**: this task adds `routingProviderFailuresByCode` and the `DAY_PLAN_ROUTING_PROVIDER` kill switch. The companion `dayPlansApproximateTotal` counter and the `publish_completed` log level are TASK-F04-2. The monthly-quota guard is out of scope (measured at homologation).
- **Service groups are not a constraint (premise, L-F04-11)**: no group field enters the optimizer or `PlanRouteStopInput`; the window is always the appointment's `time_slot_start/end`, proven in the TASK-F04-2 reader, documented here with the interleaving test.
- **Identical points (premise, L-F04-13)**: a leg `< 10 m` is a 0 s / 0 m leg with no Directions call and no geometry feature; `approximate false` for that leg; ≤ 9 m same, ≥ 11 m a normal call.
- **Tokens per environment (D16) and multiple instances (D17)**: Mapbox limits are per token = per environment; the limiter stores state in the same-environment Postgres, and the publication job (TASK-F04-2) is a pg-boss singleton; workers run inside the API process and Fly runs a second machine under load, so no per-process limit is valid.
- **Time (D14)**: instants are epoch seconds in the engine; windows are the appointment agency's wall time via `zonedWallTimeToUtc`; the day plan's civil date and 19:30 publication (TASK-F04-2) use the inspector's timezone; the device timezone never enters the logic. The platform is Sydney-only today. TZ-dependent tests pin `TZ` away from Sydney.
- **No day-plan persistence, jobs or HTTP routes here**: TASK-F04-2 persists `DayPlan`/`DayPlanStop`, schedules the job and exposes the routes; TASK-F04-5 makes the duration field required in the web form (hence the transitional `.default(45)`). The Google adapter, the Mapbox Optimization API, `depart_at` on the Matrix, multi-day, cross-inspector reallocation, vehicle constraints and return-to-base are out of scope.
- **Hard dependency on TASK-F03-2**: the backfill reads `inspection_executions.abandoned_at`; the wave merge order guarantees it is merged first. X02 is a code reference only (the `DynamicGeocodingService` pattern).
- **Pair ownership (A + A2)**: Pilar owns the branch/worktree and this spec and implements the I/O slice (`IRoutingService` + Mapbox/stub adapters, `DynamicRoutingService`, `PostgresRoutingRateLimiter`, kill switch, failure counter, `PlanRouteService`, service-type duration/migration, container, metrics); Esteio implements the pure optimizer in `packages/shared` and its Vitest suite against the shared contract. One PR, two authors.
