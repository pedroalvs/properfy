---
description: "Task list for F05-1 Live Day Dashboard API"
---

# Tasks: Live Day Dashboard API (F05-1)

**Input**: Design documents from `/specs/059-f05-1-live-day-api/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — TDD is mandatory (constitution III; the source task specifies 28 test groups). Every implementation task is preceded by its failing test.

**Organization**: by user story (US1–US6 from spec.md). The single aggregated query + one use case physically serve several stories, so the shared contract, the read-model port/repository, the T-1 filter, and the use-case skeleton are Foundational; each story then adds its domain function(s), tests, and the response fields it owns.

## Path Conventions

Monorepo: `packages/shared/src/`, `apps/backend/src/modules/live-day/`, `apps/backend/src/modules/inspector/`, `apps/backend/tests/integration/db/`.

---

## Phase 1: Setup & Shared Contract (blocks everything — shared must build before backend)

- [X] T001 [P] Add `alert_overrides_json Json?` to `model Inspector` in `apps/backend/prisma/schema.prisma` (comment: "F05 per-inspector Live Day alert overrides; null = platform defaults; no tenant_id — D14") and create the expand migration `apps/backend/prisma/migrations/<ts>_inspector_alert_overrides/migration.sql` (`ALTER TABLE "inspectors" ADD COLUMN "alert_overrides_json" JSONB;`) via `prisma migrate dev --create-only`; review the generated SQL so the `service_regions` GIST `Unsupported()` index is NOT dropped.
- [X] T002 [P] Write `packages/shared/src/schemas/platform-settings.test.ts` cases for the new `liveDayAlerts` key (accepts `{20,30}`, rejects `0`/`241`, defaults `20/30`) — RED.
- [X] T003 Add `liveDayAlertsSettingSchema`, `DEFAULT_LIVE_DAY_ALERTS`, and the `liveDayAlerts` entry (`section: 'Live Day alerts'`) to `packages/shared/src/schemas/platform-settings.ts` — GREEN.
- [X] T004 [P] Export `instantStr`, `instantStrNullable`, `civilDateStr`, `civilDateStrNullable` from `packages/shared/src/schemas/responses.ts` (no behaviour change) and re-export from `packages/shared/src/index.ts`; keep existing `responses.ts` tests green and add an import test in `packages/shared/src/schemas/live-day.schema.test.ts` (test 28, helper import).
- [X] T005 [P] Create `packages/shared/src/enums/live-day.ts`: `LiveDayInspectorState`, `LiveDayStopProgress`, `LiveDayAlertType` (7 values, no `ROUTE_INFEASIBLE`), `LiveDayLastKnownSource`, `LIVE_DAY_ALERT_TYPE_ORDER`, `LIVE_DAY_STATE_LABELS`, `LIVE_DAY_ALERT_LABELS`, `LIVE_DAY_SHOW_ALL_MAX = 40`, `LIVE_DAY_GEOMETRY_ALL_MAX_INSPECTORS = 60`; export from `index.ts`.
- [X] T006 [P] Write `packages/shared/src/live-day/inspector-route-color.test.ts` (test 9/E: deterministic index snapshot, 1000 seeded uuids spread across 12 indices ≤15% each, comma-HSL regex, contrast ≥4.5:1 vs `#FFFFFF`/`#F2EFE9`, exact palette in new order, neighbour hue ≥40° & |ΔL*| ≥1.4) — RED.
- [X] T007 Implement `packages/shared/src/live-day/inspector-route-color.ts` (`INSPECTOR_ROUTE_PALETTE`, `inspectorRouteColorIndex` FNV-1a, `inspectorRouteColor`) in the L-F05-12 order; export from `index.ts` — GREEN.
- [X] T008 Write `packages/shared/src/schemas/live-day.schema.test.ts` (test 28: query/response schemas, `today` required, `routeFeasible`/`routeViolations` required, 7 alert types, `byRegion[].agencyName` required, caps exported, `updateInspectorAlertThresholdsSchema` requires both fields allowing null) — RED.
- [X] T009 Create `packages/shared/src/schemas/live-day.ts`: `liveDayQuerySchema`, `liveDayResponseSchema` (+ `liveDayInspectorSchema`, `liveDayStopSchema`, `liveDayAlertSchema`, reusing `dayPlanGeometrySchema`), `lockedTimeQuerySchema`, `lockedTimeResponseSchema`, `inspectorAlertThresholdsResponseSchema`, `updateInspectorAlertThresholdsSchema` (`.strict()`); export from `index.ts` — GREEN.
- [X] T010 Run `pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test`; fix until green (shared `dist/` is consumed by backend).

**Checkpoint**: shared contract compiles and its tests pass; backend can import the new schemas/enums/colour/helpers.

---

## Phase 2: Foundational (read model, T-1 filter, use-case skeleton, wiring — blocks US1–US4, US6)

- [X] T011 Define `ILiveDayReadRepository` (`getDay(date): Promise<LiveDayRawRow[]>`, `getLockedTime(from,to): Promise<LockedTimeRawRows>`) and the flat row types in `apps/backend/src/modules/live-day/domain/live-day.read-repository.ts` (Prisma-free).
- [X] T012 [P] Write `apps/backend/src/modules/live-day/domain/filter-t1-visible.test.ts` (test 9d, using the real F04 T-1 predicate: SCHEDULED filtered by tomorrow/now 15:00, DONE always visible, roster exclusion) — RED.
- [X] T013 Implement `apps/backend/src/modules/live-day/domain/filter-t1-visible.ts` (`filterT1Visible(rows, todayCivil)`) reusing the F04 `T1VisibilityService` pure predicate (extract the pure predicate in the F04 module only if it is not already pure, without changing F04 behaviour) — GREEN.
- [X] T014 Implement `apps/backend/src/modules/live-day/infrastructure/prisma-live-day.read-repository.ts` `getDay` — the Algorithm §1 single `$queryRaw` (CTEs plans/appts/planned/events/reminders/roster; **no `route_geometry` / `includeGeometry` CASE** — F04 Plan B persists no geometry, so the SQL is identical in all `includeGeometry` modes and geometry is built in-memory from stop + origin coordinates; `Decimal→number`; explicit `::date`/`::text`/`::text[]`; completion-reminder prefix passed as a parameter from `COMPLETION_REMINDER_DEDUPE_PREFIX`; `json_agg` snake_case mapping).
- [X] T015 Create `apps/backend/src/modules/live-day/application/use-cases/get-live-day.use-case.ts` skeleton: `LIVE_DAY_ROLES=['AM','OP']` RBAC (`ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to view the live day')`), injectable clock + `IPlatformSettingsReader`, `date` default = actor civil today (`civilDateInTimezone(now, actor.timezone ?? PLATFORM_TIMEZONE)`), `LIVE_DAY_DATE_TOO_FAR` guard, `today`/`isToday`/`timezone`/`generatedAt`/`thresholdsDefault`/`summary` assembly, and the `live_day.read` log (no coordinates/tokens) — orchestration only; story functions plug in later.
- [X] T016 Wire `container.liveDay` in `apps/backend/src/main/container.ts` and `registerLiveDayRoutes(app, container.liveDay)` (after line 109) in `apps/backend/src/main/routes.ts`; create `apps/backend/src/modules/live-day/interfaces/live-day.routes.ts` with `GET /v1/dashboard/live-day` + `GET /v1/dashboard/locked-time`, Zod `safeParse`→`ValidationError`, `response: { 200: ... }`, and per-user rate limit (`keyGenerator = req.user?.id ?? req.ip`, evaluated after auth; fallback = sha256 of `Authorization` per `fy.routes.ts`).
- [X] T017 [P] Grep untyped test wirings that build the live-day/inspector container (lesson: new use-case dep breaks untyped wirings) and note the call sites to update.

**Checkpoint**: an empty-but-valid `live-day` response serializes and RBAC/validation/rate-limit are testable.

---

## Phase 3: User Story 1 — Live state, progress, last known point, delay (Priority: P1) 🎯 MVP

**Goal**: derived inspector state, per-stop progress, last known point, accumulated delay. **Independent test**: integration test 13 + the 01.A4 HTTP flow (13b).

- [X] T018 [P] [US1] Write `derive-inspector-state.test.ts` (test 1: full 14-row truth table) — RED.
- [X] T019 [P] [US1] Write `derive-stop-progress.test.ts` (test 2: DONE/CURRENT/OPEN/REMAINING incl. forgotten check-out, abandoned, DONE-without-execution) — RED.
- [X] T020 [P] [US1] Write `resolve-last-known-point.test.ts` (test 3: all 9 rows incl. LAST_STOP 8b) — RED.
- [X] T021 [P] [US1] Write `compute-accumulated-delay.test.ts` (test 4: baselines, negative, greatest startedAt, floor) — RED.
- [X] T022 [US1] Implement `derive-inspector-state.ts` using the F04 `classifyStops` (imported from `modules/day-plan/domain/classify-stops.ts`, no copy) — GREEN.
- [X] T023 [US1] Implement `derive-stop-progress.ts` — GREEN.
- [X] T024 [US1] Implement `resolve-last-known-point.ts` (§4 table incl. LAST_STOP never-use-origin rule) — GREEN.
- [X] T025 [US1] Implement `compute-accumulated-delay.ts` — GREEN.
- [X] T026 [US1] Assemble `state`, `progress`, `lastKnown`, `stops[]` (progress + started/finished + delayMinutes + order), `origin`, and the state `summary` counts in `get-live-day.use-case.ts`, feeding the functions off the T-1 visible rows.
- [X] T027 [US1] Write `apps/backend/tests/integration/db/live-day.repository.integration.test.ts` (test 13: Jane/Tom/Ana seed, order by name, state/progress/lastKnown/delay, appointmentCode, other-date/deleted/cancelled exclusion, join-with-status L-F04-04, LAST_STOP, T-1 and past-day branches) — RED then GREEN (drives T014/T026).
- [ ] T028 [US1] Write `apps/backend/tests/integration/db/live-day-a4.integration.test.ts` (test 13b: AM reads live-day while driving the real F03 `start`/`finish` INSP routes; NOT_STARTED→AT_PROPERTY→IN_TRANSIT→DONE_FOR_DAY; Mapbox spy = 0) — proves **01.A4** — RED then GREEN.
- [X] T029 [P] [US1] Write `get-live-day.use-case.test.ts` RBAC + default-date + summary + generatedAt + thresholdsDefault cases (test 10, subset) — RED then GREEN.

**Checkpoint**: US1 is independently demonstrable (01.A4).

---

## Phase 4: User Story 2 — Routes on demand + plan freshness (Priority: P1)

**Goal**: `includeGeometry` modes, STALE via F04 fingerprint, approximate fallback, roster cap, feasibility indicator, ETA projection. **Independent test**: tests 9b, 15, 15b, 16, 17, 18, 19, 20.

- [X] T030 [P] [US2] Write `plan-freshness.test.ts` (test 9b, real F04 `computeDayPlanFingerprint`: matches/diverges on each edit, check-in vs check-out, T-1-invisible excluded, LAST_STOP uses configured origin, 0 routing calls) — RED.
- [X] T031 [P] [US2] Write `to-eta-inputs.test.ts` (test 9c, real F06 `projectStopEta`: adapter field mapping, sequence-null excluded, past-day/no-plan skip projection, E3b/E4a end-to-end) — RED.
- [X] T032 [P] [US2] Write `build-route-fallback.test.ts` origin cases (origin override→base; `LAST_STOP`/none → no origin vertex; every feature `approximate: true`; validates against `dayPlanGeometrySchema`) — RED. *(Repurposed from the dropped `simplify-route-geometry`: F04 Plan B persists no geometry, so there is nothing to simplify.)*
- [X] T033 [P] [US2] Write `build-route-fallback.test.ts` core cases (origin+stops straight line, skip no-coord, <2 pts null, out-of-plan after plan by window) — RED.
- [X] T034 [US2] Implement `plan-freshness.ts` (`resolvePlanFreshness`: build the F04 fingerprint input — configured origin, execState per D18, T-1 rows — compare to `input_fingerprint`; `planStatus`/`routeOutOfDate`, D17) — GREEN.
- [X] T035 [US2] Implement `to-eta-inputs.ts` (`toEtaPlanInput`/`toEtaRealEvents`, L-F05-10) feeding the shared `projectStopEta` — GREEN.
- [X] T036 [US2] Implement `build-route-fallback.ts` (§6): resolved origin (override→base; skip `LAST_STOP`/none) + coordinate-bearing stops in display order → straight-line `LineString`; `<2` pts → null; every feature `approximate: true`; validate against `dayPlanGeometrySchema` — GREEN. *(No `simplify-route-geometry.ts` — F04 Plan B persists no geometry.)*
- [X] T037 [US2] Implement `build-route-geometry.ts` (per-inspector: select coordinate-bearing stops in display order + resolved origin → `buildRouteFallback`; returns `{ geometry, routeApproximate: true }`) — no stored-geometry read, no simplification cache (F04 Plan B). *(Repurposed from the dropped `simplified-geometry-cache.ts`.)*
- [X] T038 [US2] Wire geometry assembly into `get-live-day.use-case.ts`: `includeGeometry` handling (none → geometry null; selected/all → populate via `buildRouteGeometry`), `geometryIncluded`, `routeApproximate` (always true for a returned route), `predictedStartAt` via projection (date ≥ today) else planned time, `LIVE_DAY_INSPECTOR_REQUIRED` and `LIVE_DAY_TOO_MANY_ROUTES` (roster > 60) guards, and `routeFeasible`/`routeViolations` from `day_plans.feasible`/`day_plan_stops.late_s` (L-F04-05; not an alert). `routeOutOfDate` comes only from the fingerprint (no "stop set changed → fallback" gate; §6.1 corroborates STALE only).
- [X] T039 [US2] Extend `get-live-day.use-case.test.ts` with geometry-mode, roster-cap, log-scrub, and route-feasibility cases (test 10 remainder).
- [ ] T040 [US2] Write integration tests 15 (single query in all 3 modes + p95 budget), 15b (body-size + 100-inspector cap), 16 (0 Mapbox in every mode), 17 (out-of-plan stop → STALE + straight-line), 18 (removed stop → STALE), 19 (event-less edit → STALE, straight-line geometry present), 20 (past-day → straight-line + no projection) in `live-day.repository.integration.test.ts` — RED then GREEN.

**Checkpoint**: routes, STALE, fallback, projection, and budgets proven.

---

## Phase 5: User Story 3 — Per-inspector alerts (Priority: P1)

**Goal**: 7 alert types, thresholds (platform/override), ordering, exit rules. **Independent test**: tests 5, 6, 14, 23.

- [X] T041 [P] [US3] Write `resolve-effective-thresholds.test.ts` (test 6: override per field, corrupt JSON → defaults + one warn, platform change) — RED.
- [X] T042 [P] [US3] Write `derive-alerts.test.ts` (test 5: one block per type at/above/below boundary; NOT_STARTED per-stop truth table; "Sai quando" exit rules; past-day branch L-F05-02; ordering + `needsAttention`) — RED.
- [X] T043 [US3] Implement `resolve-effective-thresholds.ts` — GREEN.
- [X] T044 [US3] Implement `derive-alerts.ts` (7 types per §5, using F03 `computeEstimatedArrivalAt` for LATE_NOTICE, completion-reminder keys matched by the repository, exit rules, past-day branch, `LIVE_DAY_ALERT_TYPE_ORDER` + `occurredAt desc`) — GREEN.
- [X] T045 [US3] Wire `alerts`, `needsAttention`, and `thresholds` (effective + source) into `get-live-day.use-case.ts` and the `summary.needsAttention` count.
- [ ] T046 [US3] Write integration test 14 (seed + events: CANT_DO active/exit, LATE_NOTICE, GEOFENCE, COMPLETION_REMINDER by inspector key, OUT_OF_WINDOW, roster D19) in `live-day.repository.integration.test.ts` — RED then GREEN.

**Checkpoint**: alerts proven → **01.A5** event side covered.

---

## Phase 6: User Story 4 — Locked time (01.13) (Priority: P2)

**Goal**: confirmation-rate overall/byAgency/byRegion per D21. **Independent test**: tests 11, 21, 22.

- [X] T047 [US4] Implement `getLockedTime` in `prisma-live-day.read-repository.ts` — the Algorithm §7 single `$queryRaw` (base/regioned CTEs, group-region else `ST_Intersects` lowest `region_number`, `agencyName` per L-F05-13, D21 denominator/numerator).
- [X] T048 [US4] Implement `get-locked-time.use-case.ts` (RBAC AM/OP, default today→today+13, `LOCKED_TIME_INVALID_RANGE`, `LOCKED_TIME_RANGE_TOO_LONG`, percent rounding, `locked_time.read` log).
- [X] T049 [P] [US4] Write `get-locked-time.use-case.test.ts` (test 11: RBAC, default range, invalid/too-long range, percent/null) — RED then GREEN.
- [X] T050 [US4] Write `apps/backend/tests/integration/db/locked-time.repository.integration.test.ts` (test 21: PostGIS seed R1 global/R2 agency overlap, a1–a13, exact D21 numbers, INACTIVE/other-agency region rules, `agencyName`; test 22: single query + 0 external) — RED then GREEN.

**Checkpoint**: 01.13 proven.

---

## Phase 7: User Story 5 — Alert thresholds config (Priority: P2)

**Goal**: GET/PUT per-inspector override + platform default surfacing. **Independent test**: tests 12, 23, 26.

- [X] T051 [US5] Add `getAlertOverrides(id)` / `setAlertOverrides(id, value|null)` to the inspector repository port (`apps/backend/src/modules/inspector/domain/`) and its Prisma implementation.
- [X] T052 [US5] Implement `get-inspector-alert-thresholds.use-case.ts` and `update-inspector-alert-thresholds.use-case.ts` (RBAC via `authorizationService.assertRoles(actor, ['AM','OP'], {...})`, 404 `INSPECTOR_NOT_FOUND`, last-write-wins, idempotent-no-audit, audit `inspector.alert_thresholds_updated` `tenantId null`).
- [X] T053 [US5] Add `GET`/`PUT /v1/inspectors/:id/alert-thresholds` to `apps/backend/src/modules/inspector/interfaces/inspector.routes.ts` with the per-user rate limit; update the container wiring and the untyped test wirings found in T017.
- [X] T054 [P] [US5] Write `get/update-inspector-alert-thresholds.use-case.test.ts` (test 12) — RED then GREEN.
- [X] T055 [US5] Write `apps/backend/tests/integration/db/inspector-alert-thresholds.integration.test.ts` (test 23: PUT→GET, stored JSON, subsequent live-day uses override with `thresholdSource 'INSPECTOR'`) — proves **01.A5** override — RED then GREEN.

**Checkpoint**: threshold config proven end-to-end.

---

## Phase 8: User Story 6 — Past day / tomorrow navigation (Priority: P3)

**Goal**: date selector semantics (no today-projection on past days; NOT_STARTED to window end; DATE_TOO_FAR beyond tomorrow). **Independent test**: use-case test 10 (date cases) + past-day integration assertions in tests 13/5/9c.

- [X] T056 [US6] Confirm/implement the past-day branch in `to-eta-inputs.ts` (no `projectStopEta` when `date < today`) and `derive-alerts.ts` (NOT_STARTED to `window_end_at`; DELAY without DONE_FOR_DAY suppression) — covered by tests from T031/T042; add any missing past-day cases.
- [X] T057 [US6] Add the `date` navigation cases to `get-live-day.use-case.test.ts` (today/tomorrow/`LIVE_DAY_DATE_TOO_FAR`, `today`/`isToday` for a past `date`, L-F05-05).

**Checkpoint**: date navigation proven.

---

## Phase 9: Routes, RBAC & serializer (cross-cutting)

- [X] T058 Write `apps/backend/tests/...` Supertest route tests 24 (`live-day`: RBAC matrix, invalid date, serializer no-throw on empty fields, strip of `input_fingerprint`/`routing_matrix_json`/`alert_overrides_json`, per-user rate limit with two users one IP), 25 (`locked-time` RBAC + invalid range), 26 (`alert-thresholds` RBAC + Zod bounds + `.strict()` + non-uuid), 27 (static route coexistence) — RED then GREEN.

---

## Phase 10: Polish & Cross-Cutting

- [X] T059 Regenerate the contract: `pnpm --filter backend generate:openapi` then `pnpm --filter @properfy/shared generate:types`; rebuild shared; commit `packages/shared/openapi.json` + `packages/shared/src/api-types.ts` with no pending diff.
- [X] T060 [P] Update `apps/backend/CLAUDE.md` (new `live-day` module: AM/OP cross-tenant read with §7.1 exception, "1 query, no Mapbox", `alert_overrides_json`, the inspector alert-thresholds routes) and `packages/shared/CLAUDE.md` (`schemas/live-day.ts`, `live-day/inspector-route-color.ts`, `liveDayAlerts` key, exported wire helpers) and the root `CLAUDE.md` Active Technologies line.
- [ ] T061 Run all gates inside the worktree (via a subagent returning a condensed summary): `pnpm --filter @properfy/shared build test`; `pnpm --filter backend exec prisma generate`; `pnpm --filter backend typecheck lint test`; `pnpm --filter backend test:integration:db` (serial); confirm `git diff --stat origin/develop... | tail -1` < 150 files and no undeclared field escapes.

---

## Dependencies & Execution Order

- **Phase 1 (Setup/shared)** → **Phase 2 (Foundational)** → user-story phases.
- **US1 (P1)** is the MVP and must land before US2/US3 wiring (they extend the same use case).
- **US2, US3** both extend `get-live-day.use-case.ts` → sequence them (US2 then US3) to avoid conflicts in that file; their domain functions (T030–T037, T041–T044) are `[P]` across each other.
- **US4 (locked-time)** is independent of US1–US3 except the shared contract and repository file (add `getLockedTime` without touching `getDay`).
- **US5 (thresholds)** is independent (inspector module) but T055 depends on US1+US3 wiring (override affects live-day alerts).
- **US6** depends on US2 (projection) and US3 (alerts) branches.
- **Phase 9/10** last.

## Parallel Opportunities

- Phase 1: T002, T004, T005, T006 in parallel (different files); T001 (migration) in parallel with shared work.
- Within each story, the `[P]` test files and pure-domain implementations run in parallel; the single-file use-case/route wiring tasks are serial.

## Implementation Strategy

MVP = Phase 1 + Phase 2 + **US1** (derived state, progress, last point, delay; 01.A4). Then US2 (routes/STALE) and US3 (alerts; 01.A5) complete contract 01.8/01.11. US4 adds 01.13, US5 the threshold config, US6 the date selector. Polish regenerates the contract and runs full gates.
