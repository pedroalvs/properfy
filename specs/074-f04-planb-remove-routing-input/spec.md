# Feature Specification: F04 Plan B — Remove routingInput & Drop Dead Routing Columns (PR-C)

**Feature Branch**: `074-f04-planb-remove-routing-input`
**Created**: 2026-11-03
**Status**: Draft
**Input**: Final **contract** phase of the F04 Plan B expand/contract rollout (A→B→C). PR-A (#1337) stopped persisting Mapbox results and recomputed `geometry`/`routingInput` on demand; PR-B (#1339) moved the PWA reorder onto `POST .../order/preview` so the client **no longer reads `routingInput`**. PR-C now removes `routingInput` from the contract, makes the plan GET **Directions-only** (no per-GET Matrix now that `routingInput` is gone), and drops the dead routing columns. Also resolves the preview↔`PUT /order` mid-day-reorder asymmetry reported by Bússola.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Remove `routingInput` from the day-plan contract (Priority: P1)

As an API consumer and maintainer, `routingInput` no longer exists in the day-plan response contract (nothing reads it after PR-B), and the dead helpers that built it are gone.

**Why this priority**: It's the contract (C) half of the rollout and unblocks dropping the columns and the per-GET Matrix cost. Safe now that PR-B merged.

**Independent Test**: `GET /v1/inspector/day-plans/:date` response has no `routingInput` key; `openapi.json` + `api-types.ts` have no `routingInput`; `dayPlanRoutingInputSchema`/`toOptimizerInput`/`buildLegOverrides` are gone from `@properfy/shared`.

**Acceptance Scenarios**:

1. **Given** the shared contract, **When** PR-C lands, **Then** `dayPlanResponseSchema` has no `routingInput`, and `dayPlanRoutingInputSchema`, `DayPlanRoutingInput`, `toOptimizerInput`, `buildLegOverrides` (and the private `toIso` helper) are removed, with their tests removed/updated.
2. **Given** the regenerated contract, **When** `pnpm generate:api` runs, **Then** `openapi.json` + `api-types.ts` carry no `routingInput` and the committed files are fresh (CI `contract-freshness`).
3. **Given** an INSP or AM/OP day-plan GET, **When** called, **Then** the response validates against the new schema with no `routingInput` field and the PWA map (which reads `plan.geometry`) is unaffected.

---

### User Story 2 - Plan GET is Directions-only (no per-GET Matrix) (Priority: P1)

As the platform operator watching Mapbox cost/quota, opening a day plan no longer makes a Mapbox **Matrix** call — only the per-leg **Directions** calls needed to draw the route line. The Matrix was only recomputed on GET to populate `routingInput`, which is now gone.

**Why this priority**: Removes a pointless per-GET Matrix call (cost + shared-limiter pressure on the publish job). Directly enabled by US1.

**Independent Test**: A GET that recomputes geometry for a ≥2-stop plan calls `routing.directions` (per leg) but **not** `routing.matrix`.

**Acceptance Scenarios**:

1. **Given** a stored multi-stop plan, **When** the on-demand geometry recompute runs on GET (`PRESERVE_ORDER`), **Then** it does **not** call the provider Matrix; the per-leg timeline is seeded from the stub (haversine) and overwritten by the Directions pass, so final ETAs/geometry are unchanged.
2. **Given** the reorder **preview** endpoint (`POST .../order/preview`), **When** called, **Then** it **still** computes the Matrix on demand (`etaSource: 'MATRIX'`) — the Directions-only change applies to the GET geometry recompute only, not to preview.
3. **Given** the response, **When** geometry recompute degrades to the stub (rate-limit/provider error), **Then** `approximate`/`approximateReason` still surface (unchanged from PR-A).

---

### User Story 3 - Drop the dead routing columns (Priority: P1)

As a DBA/maintainer, the columns that are no longer written or read are dropped.

**Why this priority**: Completes the contract phase; removes dead schema. Safe because nothing persists or reads them (PR-A).

**Independent Test**: A migration drops `route_geometry`, `routing_matrix_json`, `leg_travel_json`, `geometry_purged_at`; `prisma migrate deploy` replays cleanly twice on a fresh DB; no code references remain.

**Acceptance Scenarios**:

1. **Given** the `day_plans` table, **When** the PR-C migration runs, **Then** `route_geometry`, `routing_matrix_json`, `leg_travel_json`, and `geometry_purged_at` are dropped (one migration, timestamp after `20261106000300`).
2. **Given** the code, **When** inspected, **Then** `DayPlanRecord.routeGeometry/routingMatrix/legTravel`, the repo read-mapping of those, the builder fallbacks, and the `DayPlanLegTravel` type (if otherwise unused) are removed.
3. **Given** the transitional PR-A cleanup, **When** PR-C lands, **Then** `ClearStoredRouteDataUseCase` + `repo.clearStoredRouteData()` + the domain-port method + its worker invocation and the one-time `boss.unschedule('day-plan.purge-route-data')` are removed (their job is done once PR-A has deployed to every environment, which precedes PR-C by promotion order); `registerWorkers` arity, `server.ts` call site, and the worker tests are updated accordingly.

---

### User Story 4 - Consistent mid-day reorder: preview matches `PUT /order` (Priority: P1)

As an inspector reordering my remaining stops after I've checked in to one, the live **preview** works the same as **saving** (`PUT /order`): both reorder the **not-started tail** (executed stops stay a fixed prefix), evaluated from my last stop.

**Why this priority**: PR-A's preview wrongly blocks any started day (`DAY_PLAN_ALREADY_STARTED`), while `PUT /order` correctly reorders the not-started tail — so the PWA can save a mid-day reorder but can't preview it. The F04 spec **requires** mid-day tail reorder.

**Spec basis (clear — no product ambiguity)**: `fase2-etapa1/tarefas/F04-tarefas.md` line 725 (acceptance criterion labeled *"bloqueador da revisão"*: after A's check-in, `PUT {appointmentIds:[C,B]} → 200, order A,C,B`), line 726 (*"o conjunto reordenável do PUT é calculado do estado atual (não iniciadas, D18), igual ao GET"*), and **D18** line 62 (*"executadas formam o prefixo fixo; reordenáveis = não iniciadas. A mesma regra vale no GET, no PUT /order, na impressão e no PWA"*). `DAY_PLAN_ALREADY_STARTED` (L-F04-07, lines 656/747) is scoped to the **origin** endpoints only, not reorder.

**Independent Test**: With an executed prefix today, `POST .../order/preview { appointmentIds: <not-started tail> }` returns `200` with the evaluated tail (no `DAY_PLAN_ALREADY_STARTED`), evaluated from the last executed stop.

**Acceptance Scenarios**:

1. **Given** a plan `A,B,C` today with A checked-in (executed), **When** the inspector previews `[C,B]` (the not-started tail) with the current version, **Then** it returns `200` with the tail evaluated from A's location (effective `LAST_STOP` origin), not `422 DAY_PLAN_ALREADY_STARTED`.
2. **Given** the same state, **When** the candidate ids are not exactly the not-started reorderable set (e.g. include A, or a wrong set), **Then** `400 DAY_PLAN_ORDER_MISMATCH` with `expectedAppointmentIds` (unchanged mismatch behaviour).
3. **Given** fewer than 2 not-started reorderable stops, **When** previewed, **Then** `409` (nothing to reorder) — unchanged.
4. **Given** a version mismatch, **When** previewed, **Then** `409 DAY_PLAN_VERSION_CONFLICT` — unchanged.
5. **Given** the preview result for a started day, **When** compared to the subsequent `PUT /order` of the same candidate, **Then** both use the same effective `LAST_STOP` origin and earliest-departure, so the preview's ETAs match the saved plan's (within provider variance).

### Edge Cases

- **Preview on an unstarted future plan**: unchanged — evaluated from the configured base/override origin.
- **All remaining stops started**: reorderable tail < 2 → `409` (nothing to reorder), same as today.
- **Directions-only GET with a single leg or identical points**: the <10 m Directions-skip still applies; the stub seed covers skipped legs (negligible).
- **previewOrder must keep its Matrix call**: verify the Directions-only change to `resolveMatrix`/`needsProviderMatrix` does not remove the Matrix from the preview path (preview is `etaSource: 'MATRIX'`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Remove `routingInput` from `dayPlanResponseSchema`; remove `dayPlanRoutingInputSchema`, the `DayPlanRoutingInput` type, `toOptimizerInput`, `buildLegOverrides`, and the private `toIso` helper from `packages/shared/src/schemas/day-plan.ts`; update/remove their unit tests.
- **FR-002**: Remove the backend producer of `routingInput` in `day-plan-response.builder.ts` and simplify the builder so `geometry` comes from the injected on-demand `routing` (no `record.*` routing fallbacks).
- **FR-003**: The on-demand GET geometry recompute MUST be **Directions-only** — it MUST NOT call the Mapbox Matrix. `PRESERVE_ORDER` in `PlanRouteService` seeds the timeline from the stub and overwrites per-leg via Directions; final ETAs/geometry are unchanged. `recomputeRoutingForRecord` returns geometry (+ `approximate`/`approximateReason`); it no longer needs to return `matrix`/`legs`.
- **FR-004**: The reorder **preview** endpoint MUST keep computing the Matrix on demand (`etaSource: 'MATRIX'`); FR-003 MUST NOT remove the Matrix from the preview path.
- **FR-005**: `plan.geometry` MUST remain populated on demand (recomputed Directions) in every day-plan GET response so the PWA route map is unaffected.
- **FR-006**: A single migration (timestamp after `20261106000300`) MUST drop `route_geometry`, `routing_matrix_json`, `leg_travel_json`, and `geometry_purged_at` from `day_plans`. It MUST replay cleanly twice on a fresh DB (CI).
- **FR-007**: All code references to the dropped columns MUST be removed: `DayPlanRecord` fields, the repo read-mapping, the builder fallbacks, the `DayPlanLegTravel` type (if otherwise unused), and the domain-port `clearStoredRouteData` signature.
- **FR-008**: The transitional PR-A cleanup MUST be removed: `ClearStoredRouteDataUseCase` (file + container + export), `repo.clearStoredRouteData()`, its worker invocation, and the one-time `boss.unschedule('day-plan.purge-route-data')`. `registerWorkers` arity, `server.ts` call site, and `workers.test.ts` (mock list + EXPECTED_SCHEDULES) MUST be updated.
- **FR-009**: The preview endpoint MUST allow reordering the **not-started tail** after a check-in (remove the `DAY_PLAN_ALREADY_STARTED` guard), consistent with `PUT /order` and D18. For a started day it MUST evaluate the tail from the effective `LAST_STOP` origin (last executed stop's location) and the earliest-departure derived from that stop — matching `compute-day-plan`'s REORDER logic — so preview ETAs match the saved reorder.
- **FR-010**: Regenerate the API contract (`pnpm generate:api`); commit `openapi.json` + `api-types.ts` (now without `routingInput`). This is a **breaking** removal of a response field, but no runtime consumer reads it (PR-B removed the last one).
- **FR-011**: Documentation MUST be updated in the same PR: root `CLAUDE.md`, `apps/backend/CLAUDE.md`, `packages/shared/CLAUDE.md`, and `fase2-etapa1/decisoes.md` (PR-C complete: `routingInput` removed, columns dropped, GET Directions-only, preview mid-day consistent).
- **FR-012**: Removing `routingInput` from the shared `DayPlanResponse` type orphans PWA **test fixtures** that still set it (PR-B stopped the runtime read but left the fixtures). PR-C MUST remove `routingInput` from those PWA test fixtures (test-only, no runtime PWA change) so `pnpm --filter pwa typecheck`/`test` stay green in CI, and add a one-line note to `apps/pwa/CLAUDE.md`. (This is the unavoidable cross-workspace consequence of a shared-contract field removal; it is otherwise backend + shared.)

### Key Entities

- **DayPlan** (platform-scoped, no `tenant_id`): columns `route_geometry`, `routing_matrix_json`, `leg_travel_json`, `geometry_purged_at` are **dropped**. `published_*` stop fields and metadata/totals remain.
- **DayPlan response contract** (`packages/shared`): `routingInput` + `dayPlanRoutingInputSchema` **removed**; `geometry` retained (on-demand).

## Success Criteria *(mandatory)*

- **SC-001**: `routingInput` appears in zero runtime schemas, responses, `openapi.json`, or `api-types.ts`; `toOptimizerInput`/`buildLegOverrides`/`dayPlanRoutingInputSchema` are gone.
- **SC-002**: A day-plan GET recompute for a ≥2-stop plan makes 0 Matrix calls and ≥1 Directions call (proven by a test asserting the routing port's `matrix` is not called on the GET path while `directions` is).
- **SC-003**: The preview endpoint returns `200` for a mid-day not-started-tail reorder (no `DAY_PLAN_ALREADY_STARTED`), evaluating from the `LAST_STOP` origin; mismatch/version/nothing-to-reorder behaviours unchanged.
- **SC-004**: The migration drops the 4 columns and replays twice cleanly on a fresh PostGIS DB; the full backend suite (unit + integration + integration-db) and shared suite are green.
- **SC-005**: `plan.geometry` is still populated on every GET (PWA map unaffected).

## Assumptions

- **PR-B merged (#1339, develop @3dfc678c):** the PWA no longer reads `plan.routingInput` (confirmed in code + `apps/pwa/CLAUDE.md`), so removing it is safe — this is the sanctioned PR-C of A→B→C.
- **Asymmetry is spec-clear, not a product choice:** mid-day tail reorder is required (F04-tarefas.md line 725/726, D18); implemented consistently (preview = `PUT /order`), not escalated.
- **Removing the transitional cleanup is safe:** PR-A deploys to each environment before PR-C (promotion order develop→staging→main), so the purge cron is already unscheduled and any Plan-A stored data already cleared before the columns drop.
- **Multi-tenant:** `DayPlan` stays platform-scoped (no `tenant_id`); no scope change.
- **Known CI flake (not a regression):** `routing-rate-limiter.integration.test` "grants after refill" is a timing flake; a CI hit is re-run by the coordinator.
