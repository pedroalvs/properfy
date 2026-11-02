# Tasks: Activity density layer on the appointment map (web)

**Feature**: `050-f09-2-density-map-layer` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Tech**: TypeScript 5.6 strict / React 18 / Vite 5 / TanStack Query 5 / mapbox-gl 3 / Vitest + Testing Library / web Playwright E2E. Web-only; consumes the merged `GET /v1/map/execution-density` contract. TDD mandatory (red → green → refactor).

**Story mapping**:
- **US1** (P1) — AM/OP platform-wide density: period lib, data hook, control (AM/OP branch incl. Custom + agency/inspector filters), page wiring.
- **US2** (P1) — CL agency-isolated, privacy-preserving: CL branches of the control (presets-only, discard filters, privacy text, re-anchor-once).
- **US3** (P2) — layer coexists with lasso + survives style reloads: the `DensityLayer` primitive and its ordering/style-reload behavior.

**Conventions**: `[P]` = parallelizable (different file, no incomplete dep). Every test file is written and run **red** before its implementation task. Absolute workspace root: `apps/web/`.

---

## Phase 1: Setup

- [ ] T001 Confirm worktree baseline is green and the F09-1 contract is importable: `pnpm --filter @properfy/shared build`; grep `packages/shared/src/api-types.ts` for `map/execution-density`; confirm `@properfy/shared` re-exports `ExecutionDensityResponse`, `isExecutionDensityPreset`, `EXECUTION_DENSITY_PRESET_DAYS`, `todayInTzDateString`, `addCivilDays`, `PLATFORM_TIMEZONE`. (No code change.)

## Phase 2: Foundational

*(No blocking infrastructure beyond Setup — all shared primitives already exist in `develop`. The `DensityLayer` primitive is the US3 deliverable but is also a prerequisite for the control; it is built in Phase 3 (US3) first so the control can render it.)*

---

## Phase 3: User Story 3 — Layer coexists with lasso and survives style reloads (Priority: P2, built first as a prerequisite primitive)

**Goal**: A generic, fetch-free Mapbox heatmap primitive that renders below `gl-draw-*`, re-applies on `style.load`, and re-orders below the lasso on `styledata` idempotently.

**Independent test**: Drive `DensityLayer` with a fake map object; assert add/setData/move/remove calls and handler registration/cleanup per L1–L12.

- [ ] T002 [US3] Write `apps/web/src/components/map/DensityLayer.test.tsx` (RED) covering L1–L12, L6a, L7a–L7d: fake map with `getSource/addSource/removeSource/getLayer/addLayer/removeLayer/moveLayer/getStyle().layers/isStyleLoaded/on/off/setPaintProperty`. Assert: add source+layer with 2 `Point` features `[lng,lat]`+`properties.count` and `beforeId` (undefined / first `gl-draw-*`); `setData` on rerender (no re-add); `setPaintProperty` heatmap-weight when `maxCount` changes; `removeLayer`+`removeSource` on `visible:false`; `style.load` re-create with latest cells; `styledata` `moveLayer` once below first `gl-draw-*` only when a `gl-draw-*` is below it (no loop); unmount `off` both handlers + try/catch cleanup; `map:null` no-op; empty-cells source; renders `null`; all paint colors match `/^hsla?\(\d+, \d+%, \d+%(, [\d.]+)?\)$/` with no space-form HSL.
- [ ] T003 [US3] Implement `apps/web/src/components/map/DensityLayer.tsx` (GREEN): `DensityCell`/`DensityLayerProps` types, `DENSITY_SOURCE_ID`/`DENSITY_LAYER_ID`/`DENSITY_HEATMAP_RAMP` exports, comma-HSL ramp, `beforeId`, `setPaintProperty` weight sync, `style.load` apply from a cells `ref`, `styledata` `ensureBelowDraw` (idempotent), try/catch cleanup, no camera move, renders `null`.
- [ ] T004 [US3] Export `DensityLayer` + ids/ramp/types from `apps/web/src/components/map/index.ts`.

**Checkpoint**: `pnpm --filter web test -- DensityLayer` green; the primitive is ready for the control.

---

## Phase 4: User Story 1 — Operator views platform-wide check-in density (Priority: P1) 🎯 MVP

**Goal**: AM/OP can enable the layer, pick a period (7/30/90/Custom), narrow by agency/inspector, and read a numbered legend + summary; the layer uses its own period independent of the pins.

**Independent test**: As AM, enable the toggle → request `fromDate=today-29&toDate=today`; switch to 7 days → shorter range; apply agency filter → `tenantId` sent and heatmap changes; change pin Date Range → no density request.

### Period lib (US1)

- [ ] T005 [P] [US1] Write `apps/web/src/features/appointments/lib/execution-density-period.test.ts` (RED): clock fixed at `2026-11-03T14:30:00Z`. P1–P3 `presetRange('7d'|'30d'|'90d')`; P4–P8 `validateCustomRange` messages/null; P9 preset chosen once, period stable after clock advance; P10 `isExecutionDensityPreset(presetRange(x), '2026-11-04')` true for all three.
- [ ] T006 [US1] Implement `apps/web/src/features/appointments/lib/execution-density-period.ts` (GREEN): `presetRange` = `{ fromDate: addCivilDays(today,-(N-1)), toDate: today }` with `today = todayInTzDateString(PLATFORM_TIMEZONE)`; `validateCustomRange` (both chosen, end≥start, ≤366 days, not future).

### Data hook (US1)

- [ ] T007 [P] [US1] Write `apps/web/src/features/appointments/hooks/useExecutionDensity.test.tsx` (RED): H1 disabled→no request; H2 default params no tenant/inspector; H3 both params; H4 empty-string omitted; H5 period change keeps previous during fetch; H6 error after success → frozen EMPTY (no stale leak); H7 query key; H8 `cellCount`/`minCellCount` from response; H9 loading defaults (`minCellCount:1`,`cellCount:0`,`cells:[]`); H10 `errorReason` from the error envelope `(body).error?.details?.reason`.
- [ ] T008 [US1] Implement `apps/web/src/features/appointments/hooks/useExecutionDensity.ts` (GREEN): typed `api.GET`, query key/options per contract, `EMPTY` on `isError`, omit empty params, surface `errorReason`.
- [ ] T009 [US1] Export `useExecutionDensity` + return type from `apps/web/src/features/appointments/hooks/index.ts`.

### Control — AM/OP paths (US1)

- [ ] T010 [US1] Write `apps/web/src/features/appointments/components/ExecutionDensityControl.test.tsx` (RED) — AM/OP cases C1–C3, C4 (Custom + validation inline `role=alert`, no period change on invalid), C5 (tenantId/inspectorId to hook; inspectorId='' → none), C7 (four scope-line variants + "Other map filters … don't apply."), C8 loading, C9/C9b summary + numbered relative legend + `toLocaleString('en-AU')`, C10 empty, C11 without-location line, C11c AM no privacy line, C12 truncated line, C13 error+Retry empties layer, C14 toggle off, C16 keyboard (Enter/Space/arrows/Escape closes panel keeps layer), C17 re-enable recomputes period. Mock `DensityLayer`/`useExecutionDensity` where indicated.
- [ ] T011 [US1] Implement `apps/web/src/features/appointments/components/ExecutionDensityControl.tsx` (GREEN) AM/OP structure: toolbar toggle (`aria-pressed`/`aria-controls`), panel (`role=region`), `FilterSegmented` period (+`Custom` for AM/OP via `FilterDateRange` `max=today`), scope line, numbered relative legend (inline-style gradient, comma-HSL), `aria-live` summary + extra lines, error + `Retry`, `×`/Escape close panel only, renders `DensityLayer` with memoized `cells` and `visible=enabled`; period in state, recomputed only on enable/preset/Custom.

### Page wiring (US1)

- [ ] T012 [US1] Write page tests in `apps/web/src/features/appointments/pages/AppointmentMapPage.test.tsx` (RED): E1 button in toolbar (appointments), E2 pin dateFrom change → no density request, E3 agency change propagates `tenantId`, E4 Groups mode → absent/not mounted.
- [ ] T013 [US1] Wire `ExecutionDensityControl` into `apps/web/src/features/appointments/pages/AppointmentMapPage.tsx` (GREEN) — ≤ ~12 lines: import + JSX in the toolbar, `mode === 'appointments'` only, passing `map={mapInstance}`, `isGlobalRole`, `tenantId`/`inspectorId` from `appointmentFilters` (E5: verify diff ≤ +12 lines manually).

**Checkpoint**: AM/OP MVP fully functional and independently testable.

---

## Phase 5: User Story 2 — Agency user, isolated and privacy-preserving (Priority: P1)

**Goal**: CL sees only its own agency's density, presets-only, privacy text from the response, and recovers from the Sydney day rollover with one retry.

**Independent test**: As CL, open panel → 3 presets, no Custom; request has no `tenantId`/`inspectorId`; privacy line present; a `PERIOD_NOT_A_PRESET` refetch re-anchors and retries once.

- [ ] T014 [US2] Extend `ExecutionDensityControl.test.tsx` (RED) with CL cases: C4a (3 presets, no Custom, no FilterDateRange), C4b (re-anchor once on `errorReason:'PERIOD_NOT_A_PRESET'`, then error state if it fails again), C6 (tenantId/inspectorId discarded; CL scope line), C11a (privacy line from `minCellCount`), C11b (empty-with-total "try a longer period").
- [ ] T015 [US2] Implement CL branches in `apps/web/src/features/appointments/components/ExecutionDensityControl.tsx` (GREEN): `isGlobalRole === false` → omit Custom tab, discard `tenantId`/`inspectorId` before the hook, CL scope line, privacy lines keyed off response `minCellCount`/`totalExecutions`, re-anchor-once effect on `PERIOD_NOT_A_PRESET`.

**Checkpoint**: Both P1 stories complete; D.A3 (agency isolation) satisfied client-side.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T016 [P] Update `apps/web/CLAUDE.md` (X00): document the custom Mapbox layer pattern on `/map` — source/layer outside the page, comma-HSL paint, `beforeId` before `gl-draw-*`, re-apply on `style.load` + re-order on `styledata`, cleanup in try/catch on unmount; note the activity-density layer is Appointments-mode-only and Sydney-only by design.
- [ ] T017 Run gates inside the worktree (via subagent, condensed summary): `pnpm --filter @properfy/shared build`; `pnpm --filter web typecheck`; `pnpm --filter web lint`; `pnpm --filter web test`; web E2E gate (`CI=1`) because the map flow is touched; `git diff --stat origin/develop... | tail -1` (< 150 files, ~14 expected); `git status --porcelain` empty after commits.
- [ ] T018 Browser smoke (4 profiles) per quickstart.md; capture evidence for the PR description (D.A1/D.A2/D.A3 → tests + smoke). Screenshots never committed.

---

## Dependencies & Execution Order

- **Setup (T001)** → **US3 primitive (T002–T004)** → **US1 (T005–T013)** → **US2 (T014–T015)** → **Polish (T016–T018)**.
- US3 is built before US1/US2 because the control renders `DensityLayer`. Within US1, the lib (T005–T006) and hook (T007–T009) are independent `[P]` tracks; the control (T010–T011) depends on both; page wiring (T012–T013) depends on the control.
- US2 (T014–T015) edits the same control file as US1, so it follows US1 (not parallel).

## Parallel Opportunities

- T005/T006 (period lib) and T007/T008/T009 (hook) can proceed in parallel after US3 — different files.
- T016 (CLAUDE.md) is `[P]` with the T014–T015 work (different file).

## Implementation Strategy

MVP = US3 primitive + US1 (AM/OP). That alone delivers a working, demoable density layer for operators. US2 adds the CL privacy branches on the same control. Ship as one PR (both P1 stories are in the contract's D.A3).
