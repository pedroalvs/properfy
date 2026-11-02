# Feature Specification: F04-2b — Preview route weights endpoint

**Feature Branch**: `071-f04-2b-preview-route-weights`
**Created**: 2026-11-02
**Status**: Draft
**Input**: Remediation of an orphaned shared contract. F04-2 (PR #1331, merged to `develop` @ `5657ea6d`) landed the shared contract for the route-weights preview — `previewRouteWeightsRequestSchema`, `routeWeightsPreviewSchema`, `routeWeightsPreviewResponseSchema` in `packages/shared/src/schemas/day-plan.ts`, and the error code `DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` (helper `dayPlanPreviewDateOutOfRange` in `apps/backend/src/modules/day-plan/domain/day-plan.errors.ts`) — but **dropped the backend**: there is no `PreviewRouteWeightsUseCase`, no `POST /v1/day-plans/preview` route, nothing in `openapi.json`/`api-types.ts`. This feature closes that gap, consuming the already-merged shared contract unchanged. Source of truth: `fase2-etapa1/tarefas/F04-tarefas.md` TASK-F04-2 (the preview slice), contract **01.14** and lacuna **L-F04-14**.

## Clarifications

### Session 2026-11-02 (assumed premises — no blocking ambiguity)

- **P1 — `day_plan.*` RBAC actions are freeform assertion labels, not role-matrix keys.** The existing day-plan use cases (`day_plan.view`, `day_plan.recalculate`, `day_plan.export`, `day_plan.view_eta_accuracy`) call `authorizationService.assertRoles(actor, ['AM','OP'], { action, entityType: 'DayPlan' })`; `assertRoles` does not consult `PLATFORM_SETTINGS_REGISTRY`/`role-matrix.ts` — the action string only feeds the denial audit and message. `day_plan.preview_weights` follows the same pattern. `role-matrix.ts` is therefore **not** amended (it carries only CL-conditional actions such as `map.execution_density`). Documented so a reviewer does not flag a missing matrix entry.
- **P2 — "Current" weights = the saved platform setting.** `current` is computed with `PLATFORM_SETTINGS_REGISTRY` key `routeWeights` read through `IPlatformSettingsReader.get('routeWeights')`; `proposed` is computed with `request.weights`. Both variants are evaluated against **one shared travel matrix** (contract: 1 Matrix call, 0 Directions).
- **P3 — Origin = the inspector's base (→ none when no geocoded base), never a persisted override and never `LAST_STOP`.** The preview loads **no** day-plan row, so there is no saved origin override to read; the configured origin collapses to base → none. The preview is a what-if over weights, independent of live execution state; executed stops are excluded via `classifyStops` (a future-dated preview normally has none).
- **P4 — Date range uses the actor's effective timezone.** `AuthContext.timezone` (resolved per request: `users.timezone ?? PLATFORM_TIMEZONE` for AM/OP) is the clock for the today..today+14 civil-date window (L-F04-14), not the inspector's timezone.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator previews the effect of route weights (Priority: P1)

An AM/OP user tuning the platform "Route planning" weights wants to see, for a concrete inspector on a concrete upcoming day, how a proposed set of weights would reorder that inspector's route and shift the ETAs — side by side with the route produced by the currently-saved weights — **without** persisting anything or spending a Directions call.

**Why this priority**: This is the entire feature. The shared contract and the F04-5 web "Route planning → Preview" section (paused, pre-allocated spec 056) are already committed to this endpoint; without it the contract is dead and F04-5 stays blocked.

**Independent Test**: `POST /v1/day-plans/preview` as AM/OP with a valid inspector, an in-range date and a weights object returns `200 { data: { current, proposed } }`, each a `routeWeightsPreview`, with the matrix consulted exactly once and zero Directions calls; nothing is written to `day_plans`.

**Acceptance Scenarios**:

1. **Given** an inspector with ≥2 coordinate-bearing SCHEDULED stops on an in-range day and saved default weights `{1,1,1}`, **When** AM/OP posts proposed weights `{travel:1, windowWait:0, baseProximity:1}`, **Then** the response returns `current` and `proposed` each with `etaSource: 'MATRIX'`, forward-slack ETAs, `totals {driveS, waitS, lateS}`, `feasible`, and a `stops[]` whose order reflects each weight set; the routing provider's matrix is called **once** and directions **zero** times; no `day_plans` row is created or mutated (contract 01.14).
2. **Given** an actor in Sydney with `now = 2026-11-04T23:00:00Z` (05/11 local), **When** they preview `date = 2026-11-05` or `date = 2026-11-19`, **Then** the request is accepted (200). **When** they preview `date = 2026-11-04` or `date = 2026-11-20`, **Then** the response is `422 DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` with message `"Pick a day between today and 14 days ahead"` and the routing provider is **not** called (L-F04-14).
3. **Given** any actor, **When** `inspectorId` references no inspector, **Then** the response is `404 INSPECTOR_NOT_FOUND`; **When** the weights fail `routeWeightsSettingSchema` (e.g. `10.1`, `0.15`, all-zero), **Then** `400 VALIDATION_ERROR` before any routing call.
4. **Given** a `CL_ADMIN`, `CL_USER`, `INSP` or `TNT` actor, **When** they call `POST /v1/day-plans/preview`, **Then** the response is `403 FORBIDDEN` (`day_plan.preview_weights`); AM and OP are allowed.
5. **Given** AM/OP, **When** `POST /v1/day-plans/preview` is called 11 times within one minute by the same user, **Then** the 11th call is rate-limited `429` (10/min per user).

---

### Edge Cases

- **0 or 1 reorderable coordinate stop**: the optimizer needs no ordering decision; both variants return the trivial order and `driveS/waitS/lateS` from the matrix/stub seed, `0` Directions, `feasible` reflecting windows. No crash, no 500.
- **Routing provider unavailable / matrix falls back to the stub** (interactive mode): both variants are produced from the stub matrix with `approximate: true`; the endpoint still returns 200 (it is a planning what-if, never deferred like the job).
- **Date exactly at the boundary** (today, today+14 in the actor tz): accepted; one day before today or one day past today+14: 422.
- **Stops without coordinates**: included as time-only stops in the evaluation (sequence + ETA assigned), consistent with the compute use case.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose `POST /v1/day-plans/preview` accepting a body validated by the already-merged `previewRouteWeightsRequestSchema` (`{ inspectorId: uuid, date: civilDate, weights: routeWeightsSettingSchema }`) and returning `200 { data: routeWeightsPreviewResponse }` (`{ current, proposed }`, each a `routeWeightsPreview`). The route MUST be registered as a **static** path so Fastify's radix router prefers it over `/v1/day-plans/:inspectorId/:date` (same treatment as `/v1/day-plans/eta-accuracy`).
- **FR-002**: The endpoint MUST be restricted to `AM` and `OP` via `authorizationService.assertRoles(actor, ['AM','OP'], { action: 'day_plan.preview_weights', entityType: 'DayPlan' })`; all other roles receive `403 FORBIDDEN`.
- **FR-003**: A `PreviewRouteWeightsUseCase` (application layer, one class, `execute()`) MUST compute two route variants over the inspector's reorderable candidate stops for `date`: `current` using the saved platform `routeWeights`, `proposed` using the request weights. Both MUST share **one** travel matrix — exactly **1 Matrix call and 0 Directions calls** — using matrix-based timings with forward slack; `etaSource` is the literal `'MATRIX'`. Nothing is persisted.
- **FR-004**: The use case MUST resolve `date` against the actor's effective timezone (`AuthContext.timezone ?? PLATFORM_TIMEZONE`) and reject a `date` earlier than today or later than today+14 with `422 DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` ("Pick a day between today and 14 days ahead") **before** any routing provider call (L-F04-14).
- **FR-005**: The use case MUST return `404 INSPECTOR_NOT_FOUND` when the inspector does not exist (via `IDayPlanInputReader.loadInspectorContext`), checked after the RBAC and date-range guards and before loading candidates/routing (guard order: `assertRoles` → date-range 422 → inspector 404 → candidates → preview).
- **FR-006**: The origin used for both variants MUST be the inspector's geocoded **base** (→ none when the inspector has no geocoded base); the preview reads no persisted day-plan, so no saved override and never `LAST_STOP`. Executed stops MUST be excluded via `classifyStops`.
- **FR-007**: `POST /v1/day-plans/preview` MUST be rate-limited at **10 requests/minute per user**.
- **FR-008**: Each `routeWeightsPreview` MUST carry `weights`, `etaSource: 'MATRIX'`, `approximate`, `departureAt`, `finishEta`, `totals {driveS, waitS, lateS}`, `feasible`, and `stops[]` where each stop carries `appointmentId`, `sequence`, `appointmentCode`, `suburb`, `windowStart`, `windowEnd`, `timezone` (each stop's **agency** timezone) and `eta` (instant) + `lateS` — all sourced from the day-plan candidate and the shared `evaluateSequence` result.
- **FR-009**: The OpenAPI contract (`packages/shared/openapi.json`) and typed client (`packages/shared/src/api-types.ts`) MUST be regenerated with `pnpm generate:api` and committed so CI's `contract-freshness` job passes.
- **FR-010**: `day_plan` is platform-scoped (no `tenant_id`; documented exception to root `CLAUDE.md` §7.1 — the inspector is cross-tenant, read/write only by AM/OP). The PR MUST include a scoping test proving a `CL_*`/`INSP` actor cannot reach another inspector's preview (403 before any inspector-subject read).

### Key Entities

- No new entity, table, column, migration or enum. The feature is read-only orchestration over existing day-plan building blocks (`IDayPlanInputReader`, `PlanRouteService`, `IPlatformSettingsReader`, the shared `route-planning` optimizer) plus one new application use case and one new HTTP route.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** (contract 01.14): `POST /v1/day-plans/preview` returns both `current` and `proposed` route variants from the saved vs. proposed weights, with exactly 1 Matrix call and 0 Directions calls, matrix-sourced ETAs (`etaSource 'MATRIX'`), and no persisted plan — proven by `preview-route-weights.use-case.test.ts` (Example 6: saved `{1,1,1}` → `current.order [A,C,B]`; proposed `{1,0,1}` → `proposed.order [A,B,C]`, `proposed.totals.waitS 2100`).
- **SC-002** (L-F04-14): an out-of-range date (before today / after today+14 in the actor tz) returns `422 DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` without calling routing; the 10/min rate limit returns `429` on the 11th call (route integration test; F04-2 tests 13, 23, 24c).
- **SC-003**: `CL_*`/`INSP`/`TNT` receive `403`; AM/OP succeed; the static `/v1/day-plans/preview` route never collides with `/v1/day-plans/:inspectorId/:date` (route-collision test, F04-2 test 24).
- **SC-004**: `pnpm generate:api` leaves `openapi.json` + `api-types.ts` in sync (CI `contract-freshness`), and the full backend suite (unit + route integration + integration-db) is green.

## Out of Scope

- Any change to the shared contract (schemas/error code already merged in F04-2); this feature only consumes them.
- The web "Route planning → Preview" section and the mandatory service-type duration field — those are TASK-F04-5 (paused, pre-allocated spec 056), unblocked by this PR.
- The route sheet, ETA-accuracy metric, publish job, purge and onboarding slice — already shipped by F04-2.
- Any Directions call, persistence of the previewed route, geometry, or `routingInput` on the preview response.
