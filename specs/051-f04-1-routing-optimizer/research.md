# Phase 0 — Research: TASK-F04-1 routing engine

All items below are resolved from `fase2-etapa1/tarefas/F04-tarefas.md` (TASK-F04-1 + shared decisions D2–D18) and verified against the current code snapshot (`origin/develop@470f8815`). No open `NEEDS CLARIFICATION`.

## R1 — Mapbox Matrix & Directions request shapes

- **Decision**: Matrix = `GET https://api.mapbox.com/directions-matrix/v1/mapbox/{profile}/{lng,lat;…}?annotations=duration,distance&access_token={token}`, coordinates `lng,lat` at 6 decimals, profile from `selectMatrixProfile(points.length)` (`driving-traffic` ≤ 10, `driving` 11–25, else `TOO_MANY_COORDINATES`). Directions = `GET https://api.mapbox.com/directions/v5/mapbox/driving-traffic/{coords}?geometries=geojson&overview=full&steps=false[&depart_at=…]&access_token={token}`, geometry coords parsed to 5 decimals.
- **Rationale**: D4 — Matrix decides order only (never final ETAs); Directions v5 with `depart_at` per leg gives the published ETAs and the map line. No Optimization API (v1 lacks windows, v2 beta), no `depart_at` on the Matrix (beta).
- **Alternatives considered**: Mapbox Optimization API (rejected — no hard windows / beta), one multi-point Directions call (rejected — we need a per-leg `depart_at`, so one 2-point call per leg).

## R2 — `depart_at` format and the single rule

- **Decision**: `YYYY-MM-DDThh:mm:ssZ` (UTC, seconds zeroed); sent **iff** `departAt ≥ now + 60 s` (injected clock), otherwise omitted (use current traffic). The exact format is pinned by test 34; confirm against Mapbox docs during implementation (accepted formats and past-time limit) — if the docs require a different shape, test 34 is updated, not the rule.
- **Rationale**: Avoids a past/near `depart_at` the API would reject, and keeps afternoon recomputes on live traffic.

## R3 — Shared rate limiter (token bucket in Postgres)

- **Decision**: One row per bucket (`matrix:driving-traffic` 25/25, `matrix:driving` 50/50, `directions` 250/250), refilled with the **database** clock in a single atomic statement:
  ```sql
  UPDATE routing_rate_limit_buckets
  SET tokens = LEAST(capacity, tokens + extract(epoch FROM (clock_timestamp() - refilled_at)) * refill_per_minute / 60.0) - 1,
      refilled_at = clock_timestamp()
  WHERE bucket = $1
    AND LEAST(capacity, tokens + extract(epoch FROM (clock_timestamp() - refilled_at)) * refill_per_minute / 60.0) >= 1
  RETURNING tokens;
  ```
  1 row → granted; 0 rows → wait 250 ms, retry until `maxWaitMs`; `drain` sets `tokens = 0, refilled_at = clock_timestamp()`.
- **Rationale**: D16/D17 — Mapbox limits are per token = per environment; workers run in the API process and Fly runs a 2nd machine under load, so a per-process limiter would double the real rate. The row lock from the single `UPDATE` serializes the machines (test 37b: two connections, exactly 25 of 30). Capacities sit below Mapbox's 30/60/300 per-minute ceilings.
- **Alternatives considered**: in-process limiter (rejected — not cluster-safe), Redis (rejected — constitution forbids Redis), advisory locks (rejected — the single `UPDATE … RETURNING` is simpler and atomic).

## R4 — Forward slack (no phantom wait)

- **Decision**: After the earliest-departure pass, delay departure (or the first stop's start without origin) by `d = min( Σ waits, min_{late_i=0}(W_i + windowEnd_i − start_i), min_{late_i>0}(W_i) )` where `W_i` is the cumulative wait through stop `i`; integer, O(n), deterministic; never earlier than `earliestDepartureS`.
- **Rationale**: Published ETAs must not show an inspector arriving early and idling when a later departure keeps every window (Examples 6, 6c). The pruning in the exact search omits the wait term from the bound precisely because slack can erase it, so lateness and travel remain valid lower bounds.

## R5 — Exact search pruning that never discards an optimum

- **Decision**: DFS over stops in canonical order (`windowStartS asc, key asc`), incremental prefix evaluation; prune a prefix when `prefixLate > best.totalLateS`, or `prefixLate == best.totalLateS` and `prefixBound > best.costTenths` with `prefixBound = W_t·prefixTravel + W_b·firstLeg` (no wait term). Ties are **not** pruned (finish can break them). Worst case 8! = 40320 leaves.
- **Rationale**: `compareEvaluations` orders by `(totalLateS, costTenths, finishS, rank)`; the bound uses only the monotonic lower-bound components, so an optimal leaf is never cut (test 10 vs. brute force).

## R6 — Dynamic provider resolution and token hygiene (N5)

- **Decision**: `DynamicRoutingService` calls `resolver.getConfig('mapbox')` on every call (null → stub; else a `MapboxRoutingService` cached per `accessToken`). The adapter receives the token from the dynamic service and **never** reads `MAPBOX_ACCESS_TOKEN`/`env`; a source-reading test asserts no reference under `modules/day-plan/infrastructure/routing/`. The env is only the bootstrap default of the `mapbox` config.
- **Rationale**: X00 reconciliation N5 (L-X00-06): token only through the Integrations Hub; this PR introduces `IRoutingService` and so removes the "created by F04" transition clause from `apps/backend/CLAUDE.md`.
- **Code precedent**: `modules/integration/infrastructure/dynamic-providers.ts` `DynamicGeocodingService` (resolve per call, recreate only on token change); `modules/property/infrastructure/mapbox-geocoding.service.ts` (fetch + `CircuitBreaker`, token in query, status-only error message).

## R7 — Kill switch and failure metric (L-F04-09)

- **Decision**: env `DAY_PLAN_ROUTING_PROVIDER=mapbox|stub` (default `mapbox`), validated at boot; `stub` forces the stub without reading the `mapbox` config (plans `approximate`, reason `NO_PROVIDER`), job still runs. `MetricsCollector` gains `routingProviderFailuresByCode[code]` plus `routingProviderCalls[api][outcome]` and `routingMatrixElements`. The companion `dayPlansApproximateTotal` and the `publish_completed` log level are TASK-F04-2; the monthly-quota guard is out of scope.
- **Rationale**: Gives operations a code-free provider shutoff during a billing/token incident and visibility into failure codes.

## R8 — Service-type duration backfill

- **Decision**: NOT NULL `DEFAULT 45` column + SQL CHECK 5–480 (not modeled in Prisma, no drift); an idempotent backfill block over finished `inspection_executions` (same source as `avgExecutionMinutes`, excluding `abandoned_at` and durations outside 5–480 min, ≥ 10 samples, round to 5, `LEAST/GREATEST` clamp). Hard dependency on TASK-F03-2 (`abandoned_at`).
- **Rationale**: D6; pure-expand (Postgres 11+ does not rewrite on a constant default); the ~15 direct `INSERT`s and the transitional `.default(45)` keep working until F04-5 makes the web field required.
- **Gotchas verified against memory**: `--create-only` then confirm the diff drops no `Unsupported()` index nor the functional `lower(name)` uniqueness index ("drift DROPA Unsupported()"); grep `new ServiceTypeEntity(` in tests after adding a required entity field; `serviceTypeResponseSchema` is a base others may `.extend()` — check before adding the field.

## R9 — Timezones (D14)

- **Decision**: windows are the appointment agency's wall time converted via `zonedWallTimeToUtc`; the optimizer works in epoch seconds; the day plan's civil date / 19:30 publication (F04-2) use the inspector timezone; device timezone never enters. TZ-dependent tests pin `TZ=America/Los_Angeles`.
- **Rationale**: D14 + memory `feedback_tz_dependent_test_must_pin_away`. Sydney-only today, so behavior is unchanged in practice, but DST and multi-agency (Perth + Sydney) are covered by tests 52–53.

## R10 — Mapbox commercial query (D8 / L-F04-03) — non-blocking premise

- **Decision**: The current design stands (raw matrix in the GET, `routing_matrix_json`/`leg_travel_json` stored in F04-2). The query (3 D8 questions) is opened by the F04 lead when this task starts, deadline = start of TASK-F04-2; it does **not** block this task. Plan B is written in the spec: deny (c) → `routingInput` leaves the contract, reorder uses a server preview; deny (b) → no matrix/leg JSON, re-call Matrix on save.
- **Rationale**: L-F04-03 — owner + deadline + plan B so the contract can freeze in F04-2 regardless of the answer.
