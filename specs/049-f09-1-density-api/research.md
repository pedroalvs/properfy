# Phase 0 Research: Execution Density Map API

All open questions from the spec were pre-resolved in the source task (TASK-F09-1) and its dev decisions (2026-10-27…29). No `NEEDS CLARIFICATION` remained after the clarify pass. This file records the technical decisions, their rationale, and the rejected alternatives, each verified against `origin/develop @ 75166fe6`.

## D1 — Aggregate in Postgres, never fetch-then-aggregate

- **Decision**: The repository port `ExecutionDensityReader.aggregate()` returns only `{ rows: [{ latIndex, lngIndex, count }], totals: { valid, invalid } }`. There is no method returning raw rows or coordinates. Aggregation is a `GROUP BY` on the cell index inside `$queryRaw`.
- **Rationale**: Raw inspector check-in coordinates are the inspector's position; they must never reach the application layer. Keeping aggregation in SQL makes the leak physically impossible, not merely "not currently exploited". Verified: `inspection_executions.start_latitude/start_longitude` are `Decimal(10,7)` NOT NULL, no `tenant_id` on the table.
- **Alternatives rejected**: `findMany` + in-memory grouping ("easier to test") — rejected, it would pull raw coordinates into Node. Returning the cell mean instead of the center — rejected, a single-check-in cell's mean *is* the exact coordinate.

## D2 — Integer-scaled cell index (`FLOOR(coord * 1000)`), not float division

- **Decision**: SQL computes `FLOOR(e.start_latitude * ${scale}::int)::int` with `scale = EXECUTION_DENSITY_GRID_SCALE = 1000`. A pure TS mirror `toCellIndex(decimalString)` shifts the decimal point 3 places with integer arithmetic (no `Math.floor(x * 1000)` on a float).
- **Rationale**: `start_latitude / ${0.001}` binds `0.001` as `float8`; `numeric / float8 → float8`, and a point exactly on a grid line (e.g. `-33.8690000`) can land in the neighbouring cell, diverging from the TS mirror. `numeric * int` stays `numeric` and is exact for `Decimal(10,7)`. `FLOOR` (not `ROUND`/`TRUNC`) keeps negatives in the correct cell. Proven by grid-boundary tests G5a and DB test D16, which compare SQL × `toCellIndex` point for point.
- **Alternatives rejected**: PostGIS `ST_SnapToGrid` — needs `ST_MakePoint` per row, same result, more cost; the coordinates are not geometry. Float division — the boundary bug above.

## D3 — Cell center at 4 decimals

- **Decision**: `cellCenter({ latIndex, lngIndex }) = { lat: Number(((latIndex + 0.5) / scale).toFixed(4)), lng: ... }`.
- **Rationale**: One cell ≈ 111 m (N-S) × 92 m (E-W) in Sydney; max distance real→center ≈ 72 m (G6). Always the center, never the mean (privacy). 4 decimals is enough to name a ~11 m point and keeps the payload small.

## D4 — Civil-date period → half-open instant interval

- **Decision**: `periodToInstants(fromDate, toDate) = { from: parseDateInTimezone(fromDate, PLATFORM_TIMEZONE), toExclusive: parseDateInTimezone(nextCivilDay(toDate), PLATFORM_TIMEZONE) }`; SQL filters `started_at >= from AND started_at < toExclusive`.
- **Rationale**: Half-open `[from, toExclusive)` is correct on 23 h/25 h DST days (G7 the Oct DST-start Sunday, G8 the Apr DST-end Sunday). `parseDateInTimezone` uses a two-pass offset resolution that is exact at local midnight. Never `new Date('YYYY-MM-DD')` (would be UTC midnight, off by the Sydney offset). Verified helpers exist in `apps/backend/src/shared/domain/timezone-date.ts`.

## D5 — RBAC gate before scope resolution

- **Decision**: The use case first checks `EXECUTION_DENSITY_ROLES.includes(actor.role)` (403 `AUTH_FORBIDDEN` otherwise), then calls `requireTenantScope(actor, 'map.execution_density')`.
- **Rationale**: `requireTenantScope` **throws a plain `Error` (→ 500)** for `INSP`/`TNT` (verified in `require-tenant-scope.ts`: `other-key` kinds throw "wiring mistake"). Checking the role first turns INSP/TNT into a clean 403 (U8/U9). `EXECUTION_DENSITY_ROLES = APPOINTMENT_LIST_ROLES` (reused constant `['AM','OP','CL_ADMIN','CL_USER']`), and U22 asserts it equals `ROLE_ACTION_MATRIX['map.execution_density'].roles`.
- **Alternatives rejected**: calling `requireTenantScope` first — produces a 500 for INSP/TNT.

## D6 — Tenant scope via the appointment join; CL ignores `tenantId`, rejects `inspectorId`

- **Decision**: `tenantId = resolveAppointmentListTenantScope(actor, query.tenantId)` (verified helper). For CL, `requireTenantScope` returns the JWT tenant (the `?? requestedTenantId` can never widen a pinned actor). If the actor is pinned (`pinned !== undefined`) and `query.inspectorId` is present → 403. SQL scope is `JOIN appointments a ON a.id = e.appointment_id ... AND a.tenant_id = ${tenantId}`.
- **Rationale**: `inspection_executions` has no `tenant_id`; scope is the appointment's agency (D.A3). `inspectorId` for CL is excluded by product decision (the inspector filter is AM/OP-only). This is the documented tenant-scoped case (not a platform-scoped inspector entity).

## D7 — k-anonymity by scope type, not by role list

- **Decision**: `minCellCount = pinned ? MIN_CELL_COUNT_CL (3) : MIN_CELL_COUNT_GLOBAL (1)`, applied in SQL `HAVING COUNT(*) >= ${minCellCount}` and re-filtered in the use case (`rows.filter(r => r.count >= minCellCount)`).
- **Rationale**: Choosing by the result of `requireTenantScope` (pinned → 3) means a future pinned role inherits k = 3 automatically, rather than defaulting to 1 by omission from a role list. The use-case re-filter is defense in depth (U16: a reader that forgets `HAVING` still cannot leak a low cell).

## D8 — CL restricted to 7/30/90-day presets ending today (Sydney)

- **Decision**: For pinned actors, `isExecutionDensityPreset(query, today)` must hold, where `today = civilDateInTimezone(this.now(), PLATFORM_TIMEZONE)` via an injectable `now: () => Date`. Otherwise `ValidationError('Agency accounts can only view the last 7, 30 or 90 days.', { reason: 'PERIOD_NOT_A_PRESET', allowedDays: [7, 30, 90] })` (400). AM/OP keep free periods ≤ 366 days.
- **Rationale**: A per-query `HAVING >= 3` does not survive a window-difference attack — two CL queries differing by one day would isolate that day's single check-in. Locking CL to fixed look-back presets anchored on "today" removes arbitrary window differencing. `isExecutionDensityPreset` lives in `@properfy/shared` so the web (F09-2) and backend agree. `today` from an injectable clock makes U20/U21 deterministic (fixed clock `2026-11-03T14:30:00Z` → Sydney `2026-11-04`).
- **Residual risk (accepted, documented)**: differencing the 7/30/90 presets still reveals day-band aggregates (8–30, 31–90 days ago) without isolating a single day; the window slides one day per day so a daily CL observer still sees edge variation. Accepted; documented in the PR and `apps/backend/CLAUDE.md`.
- **Alternatives rejected**: stable per-cell suppression over full agency history; a CL minimum period other than the presets — both discarded in L-F09-01 (higher cost, no better guarantee).

## D9 — "Execution" = any started, non-abandoned check-in of a non-deleted appointment

- **Decision**: Count every `inspection_executions` row with `started_at` in the window, `abandoned_at IS NULL`, appointment `deleted_at IS NULL`, in any status; exclude `(0,0)` / out-of-range coordinates (counted as `invalid`). A reopened/restarted execution counts once (one row per `appointment_id`, which is `@unique`).
- **Rationale**: The layer measures **check-ins recorded, not services completed** (L-F09-02). `DONE → REJECTED` (`DONE_REJECTED`) still counts — the check-in happened (D17). A reopened appointment keeps the original `started_at`/`start_*` (the idempotent start and reopen do not overwrite geo), so it counts once at the original cell (D18). Verified: `abandoned_at`, `resumed_at`, `appointment_id @unique` all present on the model.

## D10 — No new index, no migration

- **Decision**: Use the existing `inspection_executions(started_at)` index for the window and the `appointments` PK for the join; tenant filter applied after the join. No schema change.
- **Rationale**: Executions ≈ completed appointments (tens of thousands/year); the window index plus a small join is cheap. If a staging `EXPLAIN ANALYZE` for 366 days no-agency exceeds ~200 ms, record a covering index `inspection_executions(started_at) INCLUDE (appointment_id, inspector_id, start_latitude, start_longitude)` as a follow-up — not in this PR.

## D11 — Route container pattern mirrors `dashboard.routes.ts`

- **Decision**: New `ExecutionDensityRouteContainer { getExecutionDensityUseCase; jwtService; tenantRepo }`; `createAuthMiddleware(verify, tenantActive, clUserPermissions)`; `schema: { querystring: executionDensityQuerySchema, response: { 200: successResponseSchema(executionDensityResponseSchema) } }`; `safeParse` → `ValidationError`; `reply.status(200).send(success(result))`. Prefix `/v1/map/execution-density`. New `executionDensity` key in `AppContainer`, wired in `container.ts`, registered in `routes.ts`, and added to `tests/helpers/mock-container.ts`.
- **Rationale**: Verified pattern in `dashboard.routes.ts`. The `/map` prefix matches the consumer (the plan fixes the route). Missing the `mock-container.ts` key breaks every route test that builds the container.
- **Alternatives rejected**: adding the route to the `dashboard` module — rejected, dashboards are frozen (existing-dashboards rule) and the subject is `inspection_executions`, so the route belongs in `inspector-execution`.
