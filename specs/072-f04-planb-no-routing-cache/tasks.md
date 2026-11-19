# Tasks: F04 Plan B — No Routing Result Storage (PR-A)

**Feature**: `072-f04-planb-no-routing-cache` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
**Scope**: backend + shared only (web/pwa untouched in PR-A). Contract codes: **01.A1**, **01.A3**, **00.A5**, **01.A6**, **00.A2**; lesson **L-F04-03** resolved as Plan B (2026-11-02).

TDD is mandatory (constitution III): write the failing test first for every behavioural task. All paths are repo-relative to the worktree root.

> **Coupling note**: US1 (stop persisting) and US2/US3/US4 (on-demand recompute on GET) must land together so develop stays green — a GET after storage stops would otherwise return null geometry. They are organized as separate stories for clarity but ship in the single PR-A.

---

## Phase 1: Setup

- [ ] T001 Confirm the worktree baseline is green: `pnpm --filter @properfy/shared build && pnpm --filter backend exec prisma generate && pnpm --filter backend typecheck && pnpm --filter @properfy/shared typecheck` (already verified; re-run if the tree changed).

---

## Phase 2: Foundational (blocking prerequisites)

- [ ] T002 Add `previewDayPlanOrderRequestSchema` and `previewDayPlanOrderResponseSchema` (with `type` exports) to `packages/shared/src/schemas/day-plan.ts`, mirroring `saveDayPlanOrderRequestSchema` for the request and the contract in `contracts/inspector-day-plan-order-preview.md` for the response (`etaSource: z.literal('MATRIX')`, totals, feasible, violations, stops[]).
- [ ] T003 [P] Add validation tests for the two new schemas in `packages/shared/src/schemas/day-plan.test.ts` (valid order, duplicate ids → fail, > `DAY_PLAN_MAX_STOPS_PER_ORDER` → fail, response shape).
- [ ] T004 Export the new schemas/types from the shared barrel if not covered by the existing `schemas/index.ts` re-export; `pnpm --filter @properfy/shared build`.

---

## Phase 3: User Story 1 — Mapbox results are never persisted (P1)

**Goal**: No `route_geometry`/`routing_matrix_json`/`leg_travel_json` is ever written.
**Independent test**: compute/publish a plan → row columns are NULL while the response still has geometry/ordering.

- [ ] T005 [US1] Write a failing integration-db test in `apps/backend/tests/integration/db/day-plan-repository.integration.test.ts` asserting that after a save (compute/publish/reorder), `route_geometry`, `routing_matrix_json`, `leg_travel_json` are `NULL`.
- [ ] T006 [US1] Stop sending the routing results from the compute use case: in `apps/backend/src/modules/day-plan/application/use-cases/compute-day-plan.use-case.ts` remove `routeGeometry`/`routingMatrix`/`legTravel` from the `SaveDayPlanInput` build (keep metadata + totals + frozen `published_*`).
- [ ] T007 [US1] Stop writing the columns in the repository: in `apps/backend/src/modules/day-plan/infrastructure/prisma-day-plan.repository.ts#mapPlanFields`, drop `route_geometry`/`routing_matrix_json`/`leg_travel_json`/`geometry_purged_at` writes; adjust `SaveDayPlanInput` typing accordingly.
- [ ] T008 [US1] Update the repository read mapper (`mapPlan`) and any domain record type so the removed stored fields are no longer sourced from the DB (they will be supplied on-demand by the response path).
- [ ] T009 [US1] Run US1 tests green: `pnpm --filter backend test:integration:db -- day-plan-repository`.

---

## Phase 4: User Story 2 — Inspector route map still shows the line (on-demand geometry) (P1)

**Goal**: `response.geometry` is recomputed on demand (same field) for INSP + AM/OP GET (**01.A1**).
**Independent test**: GET a published plan → non-null geometry FeatureCollection, DB column NULL.

- [ ] T010 [US2] Write a failing test in `apps/backend/src/modules/day-plan/application/use-cases/__tests__/get-my-day-plan.use-case.test.ts`: GET recomputes `geometry` (non-null, one feature per leg, **01.A1**) even though the stored geometry is null.
- [ ] T011 [US2] Add an on-demand, order-preserving recompute path in `apps/backend/src/modules/day-plan/application/services/plan-route.service.ts` (or reuse the existing `PRESERVE_ORDER` compute) that returns geometry + matrix for the stored stop order without re-optimizing and without persisting.
- [ ] T012 [US2] Wire `get-my-day-plan.use-case.ts` to invoke the on-demand recompute and pass fresh `geometry` to `day-plan-response.builder.ts`; update the builder (`day-plan-response.builder.ts` ~149) to take geometry from the computed result instead of `record.routeGeometry`.
- [ ] T013 [US2] Ensure the stub/rate-limit degradation (D6) applies on GET: when the Mapbox bucket is drained/deferred, geometry falls back to approximate (no 5xx). Add a test forcing the stub provider → `approximate: true`, GET still 200.
- [ ] T014 [US2] Run US2 tests green: `pnpm --filter backend test -- get-my-day-plan`.

---

## Phase 5: User Story 3 — Reorder still works without a stored matrix (P1)

**Goal**: `routingInput` populated on-demand on INSP GET; new `order/preview` endpoint; `PUT /order`/`PRESERVE_ORDER` recompute the Matrix on demand (**01.A3**, **00.A5**).
**Independent test**: `POST .../order/preview` returns evaluated stops `etaSource:'MATRIX'`, persists nothing; GET `routingInput` non-null; > 30/min → 429.

- [ ] T015 [US3] Write a failing test asserting INSP GET returns non-null `routingInput` recomputed on-demand (matrix built fresh) in `get-my-day-plan.use-case.test.ts`.
- [ ] T016 [US3] Populate `routingInput` on-demand in `day-plan-response.builder.ts` (~92-102) from the on-demand matrix result instead of `record.routingMatrix` (INSP path only).
- [ ] T017 [US3] Write a failing test for the preview use case: `apps/backend/src/modules/day-plan/application/use-cases/__tests__/preview-day-plan-order.use-case.test.ts` — recomputes matrix, returns evaluated sequence with `etaSource:'MATRIX'`, persists nothing (assert repo not written), `DAY_PLAN_ALREADY_STARTED` → 422, version conflict → 409, < 2 reorderable → 409.
- [ ] T018 [US3] Implement `apps/backend/src/modules/day-plan/application/use-cases/preview-day-plan-order.use-case.ts` using the on-demand matrix + `evaluateSequence`; no writes.
- [ ] T019 [US3] Add the route `POST /v1/inspector/day-plans/:date/order/preview` in `apps/backend/src/modules/day-plan/interfaces/day-plan.routes.ts` with Zod body `previewDayPlanOrderRequestSchema`, response `previewDayPlanOrderResponseSchema`, INSP auth (own inspectorId), and a 30/min per-inspector rate limit.
- [ ] T020 [US3] Write a failing route test in `apps/backend/tests/integration/day-plan/` (or alongside existing day-plan route tests) for the preview endpoint incl. the 429 rate-limit path.
- [ ] T021 [US3] Make `PUT /order` (REORDER) recompute the Matrix on demand: in `compute-day-plan.use-case.ts` remove the `cachedMatrix: existing?.routingMatrix` reuse (~line 163) so `plan-route.service` calls `routing.matrix` fresh; keep optimizer behaviour (nearest base first unless earlier window, **01.A3**/**00.A5**).
- [ ] T022 [US3] Update `save-day-plan-order.use-case.test.ts` to assert reorder recomputes the matrix (no cached read) and persists no routing result.
- [ ] T023 [US3] Run US3 tests green: `pnpm --filter backend test -- preview-day-plan-order save-day-plan-order get-my-day-plan`.

---

## Phase 6: User Story 4 — Recalculate & operator reads recompute on demand (P2)

**Goal**: recalculate recomputes & persists nothing; operator GET returns on-demand geometry (routingInput null); ETA-accuracy still reads frozen `published_*`; route sheets intact (**01.A6**).

- [ ] T024 [US4] Write a failing test in `get-day-plan-for-operator.use-case.test.ts`: operator GET returns non-null on-demand geometry, `routingInput` null, DB columns null.
- [ ] T025 [US4] Wire `get-day-plan-for-operator.use-case.ts` to the on-demand recompute (geometry only; routingInput null for AM/OP).
- [ ] T026 [US4] Verify `recalculate-day-plan.use-case` persists no routing result (reuses US1 changes); add/adjust its test assertion.
- [ ] T027 [US4] Confirm ETA-accuracy (`get-route-eta-accuracy.use-case`) and route-sheet (`get-day-plan-sheet.use-case`) tests still pass unchanged (frozen `published_*` + ordered stops, **01.A6**); run `pnpm --filter backend test -- eta-accuracy day-plan-sheet`.
- [ ] T027a [US4] Regression-assert the publish path still emits the `ROUTE_PUBLISHED` notice (**00.A2**) and still produces a sequence + geometry (**01.A1**) under Plan B: run `pnpm --filter backend test -- day-plan-publish` (unit + `tests/integration/db/day-plan-publish.e2e.test.ts`) and confirm green.

---

## Phase 7: User Story 5 — Remove the purge job (P3)

**Goal**: the 03:45 purge schedule, handler, use case, repo method, and test are removed.

- [ ] T028 [US5] Remove the `day-plan.purge-route-data` schedule + `boss.work` handler in `apps/backend/src/main/workers.ts` (~386-393); update the two worker-registration test sites + counts (`registerWorkers` dual test sites).
- [ ] T029 [US5] Delete `apps/backend/src/modules/day-plan/application/use-cases/purge-day-plan-route-data.use-case.ts`, its test `__tests__/purge-day-plan-route-data.use-case.test.ts`, and remove `purgePastRouteData` from `prisma-day-plan.repository.ts` (~190-198) and its wiring/DI registration.
- [ ] T030 [US5] Run `grep -r "purge-route-data\|purgePastRouteData\|PurgeDayPlanRouteData" apps/backend/src` → expect no matches; `pnpm --filter backend test -- workers`.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T030a Guard the expand/contract invariant (FR-002): confirm **no** new Prisma migration directory is added in this PR (`git diff --name-only origin/develop... -- apps/backend/prisma/migrations | grep . && echo "UNEXPECTED MIGRATION" || echo "no migration (correct)"`); the routing-result columns stay nullable/unused until PR-C.
- [ ] T031 Regenerate the API contract: `pnpm generate:api`; commit `packages/shared/openapi.json` + `packages/shared/src/api-types.ts` (non-breaking; geometry/routingInput retained, preview route added) — verify with `git diff --exit-code` after regen (FR-011).
- [ ] T032 [P] Update `CLAUDE.md` (root) and `apps/backend/CLAUDE.md`: Plan B behaviour (no routing-result persistence, on-demand geometry/matrix, `order/preview` endpoint, purge job removed); add the F04-Plan-B entry to Active Technologies / day-plan module notes; remove any clause stating routing results are stored/purged. Update `packages/shared/CLAUDE.md` for the new preview schemas.
- [ ] T033 [P] Record the decision in `fase2-etapa1/decisoes.md`: L-F04-03 = **DECIDIDA (Plano B, Pedro, 2026-11-02)** — nothing persisted, on-demand recompute, `routingInput` kept on-demand until PR-C; note the A→B→C rollout.
- [ ] T034 Run the full backend gates in-worktree via a subagent (condensed summary): `pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test && pnpm --filter @properfy/shared lint && pnpm --filter @properfy/shared typecheck`; `pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test`; `pnpm --filter backend test:integration:db`.
- [ ] T035 Adversarial review loop on the branch (review → fix with TDD → re-review) until a clean pass; then commit (Conventional, no AI refs), push, open PR → `develop`; verify `git diff --stat origin/develop... | tail -1` ≤ 150 files.

---

## Dependencies & order

- Phase 2 (shared schemas) blocks US3 (preview endpoint).
- US1 + US2 + US3 + US4 are coupled (persistence stop + on-demand recompute) and must be green together before any GET works — implement US1→US2→US3→US4 in sequence.
- US5 (purge removal) is independent and can be done any time after US1.
- Phase 8 is last (contract regen depends on the route existing; docs reflect the final state).

## Parallel opportunities

- T003 (schema tests) ∥ T002 (schema) once the schema shape is drafted.
- T032/T033 (docs) are `[P]` — different files, no code dependency.
- US5 (T028–T030) can proceed in parallel with US2–US4 (disjoint files: `workers.ts` + purge files vs. GET/response paths).

## Implementation strategy

MVP = US1 + US2 + US3 (the non-breaking core: stop storing, keep the PWA map + reorder working via on-demand recompute and the new preview endpoint). US4 + US5 complete the migration. Everything ships as the single PR-A; PR-C (remove `routingInput`, drop columns) is deferred until after Bússola's PR-B.
