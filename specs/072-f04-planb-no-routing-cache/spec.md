# Feature Specification: F04 Plan B — No Routing Result Storage (on-demand geometry & matrix)

**Feature Branch**: `072-f04-planb-no-routing-cache`
**Created**: 2026-11-02
**Status**: Draft
**Input**: Migrate the already-shipped F04 day-plan routing from "Plan A" (Mapbox Matrix/Directions results persisted for the plan's validity and purged the next day) to "Plan B": no Mapbox result — matrix, per-leg durations, or route geometry — is ever persisted or cached; everything is recomputed on demand. Driven by the Mapbox Terms of Service decision recorded by Pedro on 2026-11-02 (L-F04-03 resolved as Plan B). This is **PR-A** of a sequential, non-breaking A→B→C rollout (PR-B is the PWA follow-up owned by "Bússola"; PR-C removes `routingInput` after PR-B merges).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mapbox results are never persisted (Priority: P1)

As the platform operator responsible for Mapbox ToS compliance, no routing result (Matrix, per-leg durations, or route geometry) produced by Mapbox is written to the database or cached. When a day plan is computed, published, recalculated, or reordered, the routing data used to build the response is computed in-memory and discarded; nothing survives the request.

**Why this priority**: This is the legal/contractual reason for the whole change. Until storage stops, the system is non-compliant. It is the irreducible core of the migration.

**Independent Test**: Compute/publish a day plan with the stub and the Mapbox adapter; assert the persisted `day_plans` row has `route_geometry`, `routing_matrix_json`, and `leg_travel_json` all `NULL` while the API response still carries a valid geometry and ordering. Delivers value by itself: storage compliance, even before any consumer change.

**Acceptance Scenarios**:

1. **Given** an inspector with a base and 3 confirmed appointments for tomorrow, **When** the `day-plan.publish` job runs at 19:30, **Then** the plan is published with a stop sequence and frozen `published_eta`/`published_service_start_at` on every stop (**01.A1**), **and** the persisted row has `route_geometry = NULL`, `routing_matrix_json = NULL`, `leg_travel_json = NULL`.
2. **Given** any day-plan write path (publish, recalculate, save order, set/clear origin), **When** it completes, **Then** no Mapbox-derived routing result is written to the day-plan row (only derived aggregate totals, the frozen `published_*` audit fields, and non-result metadata such as `routing_provider`/`matrix_profile`/`approximate` remain).
3. **Given** the Plan B migration (L-F04-03, resolved 2026-11-02), **When** the spec is reviewed, **Then** the resolution is recorded verbatim: Mapbox refused (b) storing the matrix/leg durations and (c) forwarding the raw matrix to the client, so nothing is stored and reordering uses a server-side on-demand recompute.

---

### User Story 2 - Inspector route map still shows the route line (Priority: P1)

As an inspector opening my day's route map in the PWA, I still see the drawn driving-route line between stops, exactly as before, even though the geometry is no longer stored. The backend recomputes the geometry from Mapbox Directions on demand and returns it in the **same** `plan.geometry` response field, so the PWA (`RouteMapView.tsx:107`) needs no change in PR-A.

**Why this priority**: The merged F04-4 PWA map hard-reads `plan.geometry`. Removing or emptying that field would break the live map. Keeping the field populated on-demand is what makes PR-A non-breaking (Q1, coordinator decision 2026-11-02).

**Independent Test**: Call `GET /v1/inspector/day-plans/:date` for a published plan; assert the response `geometry` is a non-null GeoJSON FeatureCollection with one LineString feature per leg (`fromSequence`/`toSequence`/`approximate` properties), identical in shape to Plan A (**01.A1**), while the persisted `route_geometry` column is `NULL`.

**Acceptance Scenarios**:

1. **Given** a published plan with ≥2 stops, **When** the inspector or operator GETs the plan, **Then** `response.geometry` is recomputed on-demand and populated (same schema as before, **01.A1**), and the DB `route_geometry` is `NULL`.
2. **Given** the routing provider is the stub (no Mapbox), **When** the plan is fetched, **Then** `geometry` features carry `approximate: true` and the response still renders a line (straight-segment fallback), matching the Plan A stub behaviour.
3. **Given** a plan with a single stop (no legs), **When** fetched, **Then** `geometry` is an empty FeatureCollection (or `null` per the existing nullable contract) and the request succeeds.

---

### User Story 3 - Inspector reorder still works without a stored matrix (Priority: P1)

As an inspector dragging my stops into a new order in the PWA, the estimated arrival times still update and I can save the new order. In PR-A, the client keeps working unchanged because `plan.routingInput` is still present in the response — now populated on-demand (the matrix is recomputed per GET) instead of read from storage. A new server endpoint `POST /v1/inspector/day-plans/:date/order/preview` is added so the PWA can move to a server-side evaluation in PR-B.

**Why this priority**: The merged F04-4 PWA reads `plan.routingInput` for client-side reorder math (`reorder-draft.ts:131/134` → `toOptimizerInput`/`buildLegOverrides`). Removing `routingInput` now would break reorder. The strict A→B→C order keeps it alive until PR-B switches the PWA to the preview endpoint (Q2, coordinator decision 2026-11-02).

**Independent Test**: `POST /v1/inspector/day-plans/:date/order/preview` with a candidate order returns the evaluated per-stop ETAs with `etaSource: 'MATRIX'`, recomputing the Matrix on-demand (no stored matrix read); and `GET` still returns a non-null `routingInput`.

**Acceptance Scenarios**:

1. **Given** a published plan with ≥2 reorderable stops, **When** `POST .../order/preview` is called with a candidate stop order, **Then** it recomputes the Matrix on demand, returns the evaluated sequence (per-stop ETA, wait, late, totals) with `etaSource: 'MATRIX'`, and persists nothing.
2. **Given** the preview endpoint, **When** it is called more than the configured rate (30 requests/minute per inspector), **Then** further calls are rejected with the standard rate-limit error until the window resets.
3. **Given** PR-A is deployed, **When** the inspector GETs the plan, **Then** `response.routingInput` is still present and non-null (recomputed on-demand) so the existing PWA reorder keeps functioning unchanged.
4. **Given** `PUT /v1/inspector/day-plans/:date/order` (REORDER) and the `PRESERVE_ORDER` path, **When** a new order is saved, **Then** the Matrix is recomputed on demand (no `cachedMatrix` read of a stored matrix), the optimizer still places the nearest base stop first unless an earlier window forces otherwise (**01.A3**, **00.A5**), and nothing routing-derived is persisted.

---

### User Story 4 - Recalculate and operator reads recompute on demand (Priority: P2)

As an operator or inspector recalculating a plan, the recompute runs a fresh Matrix + Directions on demand. Operator GETs that previously returned stored geometry now return on-demand geometry, still "never calls Mapbox for a write" semantics preserved as reads that recompute.

**Why this priority**: These paths also consumed stored routing data; they must align with Plan B. Lower priority than the inspector-facing paths because operators tolerate the recompute latency and the behaviour is otherwise unchanged.

**Independent Test**: `POST /v1/day-plans/:inspectorId/:date/recalculate` produces a plan whose response has geometry/ordering but whose row stores no routing result; the ETA-accuracy metric still reads the frozen `published_*` fields.

**Acceptance Scenarios**:

1. **Given** a recalculate (MANUAL_RECALC) on either the INSP or AM/OP route, **When** it runs, **Then** it recomputes Matrix + Directions on demand and persists no routing result.
2. **Given** `GET /v1/day-plans/:inspectorId/:date` and `GET /v1/day-plans/eta-accuracy`, **When** called, **Then** geometry is returned on-demand and the ETA-accuracy metric still reads the frozen `published_*` stop fields (**01.A1** publication audit intact).
3. **Given** the route sheet endpoints (`GET .../:date/sheet`), **When** called, **Then** the PDF/XLSX still contain the ordered stops (**01.A6**) using the on-demand computed plan.

---

### User Story 5 - The route-data purge job is removed (Priority: P3)

As a platform maintainer, the daily 03:45 `day-plan.purge-route-data` job and its use-case no longer exist, because there is no stored routing result to purge.

**Why this priority**: Dead infrastructure once storage stops. Removing it prevents confusion and a scheduled no-op, but it is harmless if left temporarily, hence P3.

**Independent Test**: The pg-boss schedule list no longer contains `day-plan.purge-route-data`; `registerWorkers`/`scheduleWorkers` no longer reference the purge use-case; the use-case file and its test are removed (or the use-case is reduced to nothing and unregistered).

**Acceptance Scenarios**:

1. **Given** the worker registration, **When** workers start, **Then** no `day-plan.purge-route-data` schedule or handler is registered.
2. **Given** the repository, **When** code is inspected, **Then** `purgePastRouteData` and `geometry_purged_at` writes are removed (column may remain nullable and unused until the PR-C migration drop).

### Edge Cases

- **Stub provider / no Mapbox token**: geometry is recomputed as approximate straight segments; `routingInput`/preview still return a usable (approximate) matrix. No persistence either way.
- **Rate limit reached during on-demand GET**: the shared Postgres Mapbox rate limiter governs Matrix/Directions; when the bucket is empty, the compute falls back to the stub (approximate) rather than failing the GET, preserving the non-breaking guarantee. (The dedicated geometry-only endpoint that would avoid recomputing Directions on every GET is recorded as a **future optimization**, not in scope for PR-A — Q1 caveat, coordinator 2026-11-02.)
- **Single-stop plan**: no legs → empty/null geometry and null `routingInput`; preview rejects (nothing to reorder) with a clear error.
- **Plan already started (first check-in done)**: reorder/preview remain blocked by the existing `DAY_PLAN_ALREADY_STARTED` rule (L-F04-07) — unchanged by Plan B.
- **Concurrent GETs**: multiple on-demand recomputes are independent and idempotent; no shared cached state is written, so there is no race on routing data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST NOT persist any Mapbox-derived routing result. `compute-day-plan.use-case` and `prisma-day-plan.repository` MUST stop writing `route_geometry`, `routing_matrix_json`, and `leg_travel_json`.
- **FR-002**: The columns `route_geometry`, `routing_matrix_json`, `leg_travel_json`, `geometry_purged_at` MUST remain in the schema as nullable/unused (expand/contract; dropped in a later PR-C migration). No migration that drops them ships in PR-A.
- **FR-003**: `GET` day-plan responses (INSP and AM/OP) MUST return `geometry` recomputed on demand in the **same** `plan.geometry` field and schema (**01.A1**), so no PWA change is required in PR-A.
- **FR-004**: `GET` day-plan responses MUST keep `routingInput` present and non-null for reorderable plans, recomputed on demand from a fresh Matrix (kept alive for the current PWA until PR-B). The `routingInput`/`dayPlanRoutingInputSchema` contract MUST NOT be removed in PR-A.
- **FR-005**: The system MUST add `POST /v1/inspector/day-plans/:date/order/preview` that evaluates a candidate stop order server-side by recomputing the Matrix on demand, returns the evaluated sequence with `etaSource: 'MATRIX'`, persists nothing, and is rate-limited to 30 requests/minute per inspector.
- **FR-006**: `PUT /v1/inspector/day-plans/:date/order` (REORDER) and the `PRESERVE_ORDER` recompute path MUST recompute the Matrix on demand instead of reusing a stored matrix (`cachedMatrix`), and MUST persist no routing result.
- **FR-007**: `recalculate` (INSP and AM/OP) MUST recompute Matrix + Directions on demand and persist no routing result.
- **FR-008**: The optimizer behaviour MUST be preserved: nearest-to-base stop first unless an earlier confirmed window forces another order (**01.A3**), with the base address as origin (**00.A5**); route sheets (**01.A6**) and the `ROUTE_PUBLISHED` notice (**00.A2**) are unaffected.
- **FR-009**: The frozen publication audit fields (`published_eta`, `published_service_start_at`, `published_predicted_at`, `published_approximate`) MUST continue to be written at publication and read by the ETA-accuracy metric. They are not Mapbox live data and are NOT removed.
- **FR-010**: The `day-plan.purge-route-data` pg-boss schedule (03:45) and its worker handler MUST be removed; `PurgeDayPlanRouteDataUseCase`, the repository `purgePastRouteData`, and `geometry_purged_at` writes MUST be removed. The associated test MUST be removed or repurposed.
- **FR-011**: `packages/shared` api-types MUST be regenerated (`pnpm generate:api`) and the change MUST be non-breaking (geometry and routingInput still present); the committed `openapi.json` + `api-types.ts` MUST be fresh (CI `contract-freshness`).
- **FR-012**: The shared Mapbox rate limiter MUST govern all on-demand recomputes; when a bucket is exhausted, on-demand GET geometry/routingInput MUST degrade to the stub (approximate) rather than failing the request.
- **FR-013**: Documentation MUST be updated in the same PR: root `CLAUDE.md` and `apps/backend/CLAUDE.md` (Plan B behaviour, on-demand geometry/matrix, removed purge, preview endpoint), `fase2-etapa1/decisoes.md` (L-F04-03 = Plan B, 2026-11-02), and this spec records L-F04-03 as resolved.

### Key Entities *(include if feature involves data)*

- **DayPlan** (platform-scoped, **no `tenant_id`** — D10 exception; inspector is cross-tenant): after PR-A, the routing-result columns `route_geometry`, `routing_matrix_json`, `leg_travel_json`, `geometry_purged_at` are unused/nullable (dropped in PR-C). Retained: aggregate totals (`total_drive_s`, `total_wait_s`, `total_service_s`, `total_late_s`, `total_distance_m`, `departure_at`, `finish_eta`), non-result metadata (`routing_provider`, `matrix_profile`, `approximate`, `approximate_reason`), and origin coordinates.
- **DayPlanStop** (no `tenant_id`): the frozen `published_*` ETA audit fields are retained and still written at publication.
- **DayPlan response contract** (`packages/shared`): `geometry` and `routingInput` fields retained, now populated on-demand. `dayPlanRoutingInputSchema` retained for PR-A (removed in PR-C).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After any day-plan write (publish/recalculate/order/origin), 100% of `day_plans` rows have `route_geometry`, `routing_matrix_json`, and `leg_travel_json` equal to `NULL`.
- **SC-002**: 100% of day-plan GET responses for a published multi-stop plan return a non-null `geometry` FeatureCollection and a non-null `routingInput`, with no corresponding stored routing result (verified by an integration test against a real database).
- **SC-003**: The inspector reorder flow in the current (unchanged) PWA continues to function end-to-end against PR-A (`routingInput` present; `PUT /order` recomputes Matrix) — proven by backend route/integration tests; develop never breaks.
- **SC-004**: `POST .../order/preview` returns a correct server-evaluated sequence with `etaSource: 'MATRIX'` and is rejected beyond 30 req/min per inspector.
- **SC-005**: No `day-plan.purge-route-data` schedule or handler exists; the full backend suite (unit + integration + integration-db) is green.

## Assumptions

- **L-F04-03 resolved (2026-11-02, Pedro):** Mapbox refused storing the matrix/leg durations (b) and forwarding the raw matrix to the client (c); therefore Plan B applies — nothing is stored and reordering uses on-demand server recompute. This spec records the resolution.
- **Q1 (coordinator, 2026-11-02):** geometry stays in the same `plan.geometry` field, recomputed on-demand; the PWA is NOT changed in PR-A. The per-GET Directions cost is accepted; a dedicated geometry-only endpoint is a future optimization, out of scope here.
- **Q2 (coordinator, 2026-11-02):** strict non-breaking A→B→C; PR-A keeps `routingInput` alive via on-demand recompute. `routingInput` removal, `dayPlanRoutingInputSchema` removal, `toOptimizerInput`/`buildLegOverrides` removal, and the column drop migration are **deferred to PR-C**, after Bússola's PR-B.
- **Q3 (coordinator, 2026-11-02):** the coordinator dispatches Bússola for PR-B after PR-A merges; PRs merge sequentially, each green before the next.
- **Multi-tenant exception:** `DayPlan`/`DayPlanStop` have no `tenant_id` (inspector is cross-tenant, D10 exception), consistent with the existing F04 model; scope is guaranteed by RBAC and the inspector's own `inspectorId`.
- **Rate limiting:** the existing shared Postgres Mapbox rate limiter and `DAY_PLAN_ROUTING_PROVIDER` kill switch are reused; no new limiter infrastructure is introduced (the 30/min preview cap is a per-inspector application-level limit on top).
- **Dark feature:** the inspector day-plan UI is not yet wired into general navigation, so the interim on-demand matrix recompute on GET has negligible production cost.
