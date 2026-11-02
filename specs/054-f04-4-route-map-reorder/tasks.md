# Tasks: PWA Route Map and Reorder (F04-4)

**Feature**: `054-f04-4-route-map-reorder` · **Workspace**: `apps/pwa` (+ docs) · **TDD: mandatory** (red → green → refactor).
All paths are under `apps/pwa/` unless noted. Consumes merged `@properfy/shared` + F04-2/F04-3 contracts — **no backend/schema/api-types/migration change**.

## Phase 1: Setup

- [ ] T001 Add exact deps `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/modifiers@9.0.0`, `@dnd-kit/utilities@3.2.2` to `apps/pwa/package.json` and run `pnpm install` to update root `pnpm-lock.yaml`; confirm `pnpm --filter pwa typecheck` still passes.

## Phase 2: Foundational — generalize the map toolkit into `src/lib/map/` (blocks US1; keeps offers green)

**Tests first (RED):**
- [ ] T002 [P] Move/author `src/lib/map/__tests__/markers.test.ts` (from `features/offers/lib/offers-map/__tests__/markers.test.ts` + new cases): `makeNumberedMarkerEl({label,variant:'stop'|'done'|'origin'|'group',ariaLabel})` → `<button>` with `aria-label`, inline style **without** `transform` (`el.style.transform === ''`), colors via `hsl(var(--primary))`; `applyCollisionOffsets` uses `setOffset` only.
- [ ] T003 [P] Move/author `src/lib/map/__tests__/colors.test.ts` (from `useOfferRoute.test.ts`): `hslTripletToMapboxColor('221 83% 53%')` → `hsl(221, 83%, 53%)`; empty → `#2563EB`.
- [ ] T004 [P] Author `src/lib/map/__tests__/useGeoJsonLineLayer.test.ts` (fake map): adds one source + **two** layers (solid `filter ['!=',['get','approximate'],true]`, dashed `line-dasharray [0.5,2]` `filter ['==',['get','approximate'],true]`); `line-color` matches `/^hsl\(\d+, \d+%, \d+%\)$/` or `#2563EB`; `setData` on change; `null` → empty FC; new map after retry → re-adds.
- [ ] T005 [P] Author `src/lib/map/__tests__/useMapCamera.test.ts` (generalized): `points:{lat,lng}[]`; 0 → `AU_CENTRE`; 1 → `flyTo` zoom 15; many → `fitBounds` maxZoom 15 padding 48; no refit after user gesture; `refit()` forces.
- [ ] T006 Move `src/lib/map-bounds.ts` → `src/lib/map/bounds.ts` and its test `src/lib/__tests__/map-bounds.test.ts` → `src/lib/map/__tests__/bounds.test.ts` (via `git mv`), updating imports.

**Implementation (GREEN):**
- [ ] T007 `git mv` `features/offers/hooks/useMapboxInstance.ts` → `src/lib/map/useMapboxInstance.ts` (API unchanged); `git mv` `features/offers/hooks/useMapCamera.ts` → `src/lib/map/useMapCamera.ts` and generalize to accept `points:{lat,lng}[]` (`computeCenter(points)`).
- [ ] T008 `git mv` `features/offers/lib/offers-map/markers.ts` → `src/lib/map/markers.ts`; add `makeNumberedMarkerEl` with variants; make `makeMarkerEl`/`makeAppointmentMarkerEl` call it; keep `applyCollisionOffsets`/`isValidCoordinate`/`PlacedMarker`.
- [ ] T009 Create `src/lib/map/colors.ts` (`hslTripletToMapboxColor`, `resolvePrimaryColor` extracted from `useOfferRoute`) and `src/lib/map/useGeoJsonLineLayer.ts` (two filtered layers, comma-HSL paint, `setData`, retry re-add).
- [ ] T010 Create `src/lib/map/MapStatusOverlay.tsx` (error/retry + "no pins" extracted from `features/offers/components/MapOverlays.tsx`) and `src/lib/map/index.ts` barrel.
- [ ] T011 Update offers consumers to import from `@/lib/map`: `features/offers/hooks/{useOfferPins,useOfferRoute}.ts`, `features/offers/components/{OffersMapView,MapOverlays}.tsx`, `features/offers/lib/offers-map/types.ts`; delete the moved files.
- [ ] T012 Run offers regression tests green: `features/offers/components/__tests__/OffersMapView.test.tsx`, `features/offers/hooks/__tests__/useOfferRoute.test.ts` (adjust imports only; no behavior change).

## Phase 3: User Story 1 — Route map (P1, criterion 01.A1 map part)

**Goal**: Map tab with numbered pins in plan order, origin, and the real Directions line. **Independent test**: open a published plan, tap Map, see pins 1..N + origin + line (dashed for approximate), tap a pin → details.

**Tests first (RED):**
- [ ] T013 [P] [US1] Author `features/day-plan/components/__tests__/RouteMapView.test.tsx` (`mapbox-gl` mocked) covering all rows of the task's "Mapa do roteiro" table: pins 1..N with `aria-label`; origin BASE; no origin for NONE; done variant; `missingCoordinates` → no pin + "{k} stop(s) aren't on the map…"; geometry 2 features (1 approximate) → `setData` + solid+dashed; no geometry → pins only; dirty draft → renumber + hidden line + "Save to update the route line"; identical pins (L-F04-13) → `setOffset` distinct, no line 2→3; `LAST_STOP` (L-F04-07) → no origin marker, stop 1 done; camera fitBounds; tap pin → chip + "Open details" → `/schedule/<id>`; no token; error; offline; no `line-color` with space; no `style.transform`.
- [ ] T014 [US1] Extend `features/day-plan/pages/__tests__/RoutePage.test.tsx`: `Segmented` List/Map (`role="tablist"/"tab"`), default List, `?view=map` (replace), Map chunk lazy (mock `React.lazy` import).

**Implementation (GREEN):**
- [ ] T015 [US1] Create `features/day-plan/hooks/useRoutePins.ts` (stops → `RoutePin[]`: label by current order, variant from execution/appointment status, synthesize `origin` pin from `plan.origin` unless `LAST_STOP`/`NONE`, skip `missingCoordinates`, build `aria-label`/chip).
- [ ] T016 [US1] Create `features/day-plan/components/RouteMapChip.tsx` (pin-tap chip: title, address, window, "Open details" → `/schedule/{id}`, dismiss).
- [ ] T017 [US1] Create `features/day-plan/components/RouteMapView.tsx` (lazy): `@/lib/map` instance+camera+markers+line; origin/done/stop variants; collision offsets; `missingCoordinates` note; token/error/offline overlays via `MapStatusOverlay`; "Fit route" control; dirty-draft renumber + hidden line + chip; height fills pane (phone `h-[calc(100dvh-…)]`, wide `fillHeight`); `aria-label="Route map"`.
- [ ] T018 [US1] Modify `features/day-plan/pages/RoutePage.tsx`: add `Segmented` List/Map below `RouteSummary`/`OriginRow`, `?view=` state (replace), `React.lazy` the Map; draft is owned by `RoutePage` and shared across tabs.
- [ ] T019 [US1] QA M1–M4 (map) against Mapbox real + stub; record in PR checklist.

## Phase 4: User Story 2 — Reorder locally with live cost (P1, criterion 01.A2)

**Goal**: drag/arrows reorder with local recompute, "+N min vs. suggested", window warnings. **Independent test**: reorder ≥2 not-started stops, see "~" ETAs + delta + warning, no network call.

**Tests first (RED):**
- [ ] T020 [P] [US2] Author `features/day-plan/lib/__tests__/reorder-draft.test.ts` over the fixture with a known matrix covering the task's "Libs puras" table: live `reorderableIds`/`lockedIds` (only `NOT_STARTED`); this-device IN_PROGRESS removal; `legTravelS` unchanged → `finishS` = server `finishEta` ±0; mixed/displaced legs (`buildLegOverrides` wiring); `earliestDeparture` today vs tomorrow; `alignOrder`; `moveItem`/`moveUp`/`moveDown`; evaluate new+suggested same criterion; `deltaFinishMin` text; `totalTravelS` text; violations + message with new-order position; `routingInput null` → `canReorder false`; 1 reorderable → `canReorder false`; `RouteOrderMismatchError` → `invalid`; local ETA ISO "~".
- [ ] T021 [P] [US2] Author `features/day-plan/components/__tests__/ReorderableStopList.test.tsx` covering the task's "Reordenação" table: controls only on `NOT_STARTED`; bound-disabled arrows; arrow move + focus retention; `aria-live` announcement; dnd-kit keyboard + pointer; Escape cancels; local "~" ETAs/legs; summary delta; per-item + summary window warning with **Save enabled**; `routingInput null` message; past date → no controls; offline → active controls, Save disabled; reduced-motion → no animation.

**Implementation (GREEN):**
- [ ] T022 [US2] Create `features/day-plan/lib/reorder-draft.ts`: `getReorderable(plan, localExecState)` (live, incl. F03 this-device state), `alignOrder`, `moveItem`/`moveUp`/`moveDown`, `evaluateDraft(plan, order, now)` using `toOptimizerInput`+`buildLegOverrides`+`evaluateSequence` from `@properfy/shared`, `formatDelta`, `toViolationMessages(order)`. Pure, no React.
- [ ] T023 [US2] Create `features/day-plan/components/ReorderControls.tsx` (44×44 up/down arrows, bound-disabled, focus retention) and `features/day-plan/components/SortableStopRow.tsx` (drag handle 44×44 `touch-action:none`, `StopCard variant="row"`, arrows; `aria-label`s).
- [ ] T024 [US2] Create `features/day-plan/components/ReorderableStopList.tsx`: `DndContext` (PointerSensor delay 150/tol 5, KeyboardSensor), `SortableContext verticalListSortingStrategy`, `restrictToVerticalAxis`+`restrictToParentElement`, `autoScroll`, English announcements; fixed prefix for non-reorderable; `prefers-reduced-motion` handling; help text.
- [ ] T025 [US2] Create `features/day-plan/hooks/useReorderDraft.ts` (initial slice: `{order, baseVersion}`, `isDirty`, move/align/reset-local, memoized `evaluateDraft` by `(plan.version, order, currentMinute)`); wire F03 local execution state for live reorderable set.
- [ ] T026 [US2] Modify `features/day-plan/components/RouteSummary.tsx`: show "Finish ~{hh:mm} · {delta} · {drive} driving" during edit, saved-order delta + "Reset to suggested order" link when `manualOrder`, and the `role="status"` violation summary lines (warn only).

## Phase 5: User Story 3 — Save order & conflicts (P1, criterion 4 + DB3 persistence)

**Goal**: Save the order optimistically, handle 409/422/429/network. **Independent test**: Save → PUT with only reorderable ids + `basedOnVersion`; simulate each error code.

**Tests first (RED):**
- [ ] T027 [P] [US3] Author `features/day-plan/components/__tests__/ReorderSaveBar.test.tsx` covering the task's "ReorderSaveBar" table: appears on dirty; Save 200 → PUT `{appointmentIds,basedOnVersion}` (reorderable only) + `setQueryData` + clear + snackbar; 200+violations snackbar; double-tap → 1 PUT (`disabled`+`aria-busy`); 409 CONFLICT/STALE → invalidate+discard+alert; 422 MISMATCH → refetch+alert; 422 DATE_IN_PAST → read-only; network → keep draft+msg; 429 → keep+msg; Discard → revert; leave-with-draft → `useUnsavedChangesPrompt`.

**Implementation (GREEN):**
- [ ] T028 [US3] Create `features/day-plan/hooks/useSaveDayPlanOrder.ts`: `PUT /v1/inspector/day-plans/:date/order` via the typed client (no `Idempotency-Key`), `setQueryData` on 200, map 409/422/429/400/network to the documented messages and invalidate/refetch paths.
- [ ] T029 [US3] Create `features/day-plan/components/ReorderSaveBar.tsx`: sticky above `pb-nav-clear` (phone) / within pane (wide), delta + Discard + Save (`aria-busy`), offline-disabled, frozen/STALE-disabled states; `useUnsavedChangesPrompt(isDirty, …)`.
- [ ] T030 [US3] Modify `features/day-plan/components/RouteStopList.tsx` to be the wrapper choosing static list (F04-3) vs `ReorderableStopList` + mount `ReorderSaveBar` when reorder is available.

## Phase 6: User Story 4 — Live plan changes & reset (P2)

**Goal**: freeze/discard draft on version/set/STALE changes; reset to suggested (local + saved). **Independent test**: refetch v4 while dirty → frozen; set change → discard; reset paths.

**Tests first (RED):**
- [ ] T031 [P] [US4] Author `features/day-plan/hooks/__tests__/useReorderDraft.test.ts` covering the task's "useReorderDraft" table: new version no draft → adopt; new version + draft → frozen alert + Review + Save disabled; set changed (CANT_DO) → discard + message; STALE → Save disabled "Updating your route…"; reset local → `alignOrder(suggestedOrder)` no API; reset saved → confirm dialog + `POST …/recalculate` + `setQueryData` + snackbar; reset error → server message + refetch.

**Implementation (GREEN):**
- [ ] T032 [US4] Extend `features/day-plan/hooks/useReorderDraft.ts`: version-freeze (+ Review), set-change discard, STALE disable, this-device check-in discard, local reset-to-suggested.
- [ ] T033 [US4] Create `features/day-plan/hooks/useResetDayPlanOrder.ts`: confirm dialog + `POST /v1/inspector/day-plans/:date/recalculate` + `setQueryData` + snackbar + error handling; wire the "Reset to suggested order" entry points (RouteSummary link + dirty-draft action).

## Phase 7: Polish & Cross-Cutting

- [ ] T034 [P] Update `apps/pwa/CLAUDE.md`: map toolkit now in `src/lib/map/` (no longer only `features/offers`); new day-plan map/reorder files, `@dnd-kit/*` dep, `?view=` state, reorder draft/Save/reset, L-F04-03 Plan A.
- [ ] T035 [P] Update root `/CLAUDE.md` "Active Technologies"/"Recent Changes" with the F04-4 entry (PWA route map + reorder, consumes F04-1/2/3, no backend/schema/api-types change).
- [ ] T036 Bundle check per quickstart: `pnpm --filter pwa build` on develop vs branch, record gzip sizes + `grep -l ROUTE_ORDER_MISMATCH dist/assets/*.js`; if entry chunk > +5 kB gzip or `route-planning` in entry chunk, add `@properfy/shared/route-planning` subpath export and re-measure; record result in PR.
- [ ] T037 Run `grep -rn "style.transform" apps/pwa/src/lib/map apps/pwa/src/features/day-plan` → no hits outside comments; full gates `pnpm --filter @properfy/shared build && pnpm --filter pwa lint typecheck test build && pnpm --filter pwa check:ds`.
- [X] T038 Per **DB9**, F04-4's gate is Vitest + RTL + manual QA (only F04-3b uses Playwright E2E). No new E2E specs; instead confirm the existing `test-pwa-e2e` suite (4 projects, Chromium + WebKit) still passes after the map-toolkit move, RoutePage/offers/StopCard changes (no new authenticated-boot call → `BASELINE_STUBS` unchanged).
- [ ] T039 Manual QA R1–R11 (reorder) on iOS Simulator / Android Chrome / iPad; record in PR checklist (screenshots never committed).

## Dependencies & order

- **Setup (T001)** → everything using `@dnd-kit` (US2+).
- **Foundational (T002–T012)** → **US1 (T013–T019)** (map toolkit) and keeps offers green; independent of US2.
- **US2 (T020–T026)** depends only on merged `@properfy/shared` + T001; `useReorderDraft` created in US2, extended in US4.
- **US3 (T027–T030)** depends on US2 (draft + list).
- **US4 (T031–T033)** depends on US2/US3 (draft + save/reset wiring).
- **Polish (T034–T039)** last.

## Parallel opportunities

- T002–T005 (map lib tests) in parallel; T013/T020/T027/T031 (story test files, different paths) can be authored in parallel within their phase gating.
- US1 (map) and US2 (reorder) are largely independent after Foundational; US1 touches `src/lib/map` + map components, US2 touches reorder libs/components — minimal overlap (both touch `RoutePage`/`RouteStopList`, serialize those edits).

## MVP

US1 (map) + US2 (local reorder) deliver criteria 01.A1 and 01.A2; US3 makes the reorder durable (Save); US4 hardens concurrent-change safety. Full task requires all four + polish.

## Independent test criteria

- US1: pins/origin/line render and a pin opens details — no reorder needed.
- US2: reorder recomputes locally with delta + warnings — no Save needed.
- US3: Save persists and every conflict code is handled — reload/alert, no overwrite.
- US4: concurrent change freezes/discards safely; reset works local + saved.
