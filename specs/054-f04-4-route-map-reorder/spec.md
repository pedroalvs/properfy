# Feature Specification: PWA Route Map and Reorder (F04-4)

**Feature Branch**: `054-f04-4-route-map-reorder`
**Created**: 2026-11-02
**Status**: Draft
**Input**: User description: "F04-4 PWA route map and reorder"

## Overview

The inspector's **Day Screen / Route** (delivered by TASK-F04-3) currently shows the day plan as a read-only list of stops. This feature (TASK-F04-4) adds two capabilities to that Route screen in the PWA (`apps/pwa`), both consuming the already-merged day-plan contracts from TASK-F04-1/F04-2/F04-3 — **no backend, schema, or `api-types` change**:

- **01.4 — Route map**: a **Map** tab on the Route with numbered pins in plan order, an origin pin, and the **real driving line** (`geometry` from the backend, computed by Mapbox Directions), reusing the offers-map hooks generalized into `src/lib/map/`.
- **01.3 — Reorder**: reorder the stop list by dragging (`@dnd-kit`) **or** up/down arrows, with a **local** recalculation using the plan's raw matrix (`toOptimizerInput` + `evaluateSequence` from `@properfy/shared`, no API call), a "+N min vs. suggested" delta, per-stop window warnings, **Save order** with optimistic version conflict handling, and "Reset to suggested order".

This is lane **C (PWA)** of the Properfy Phase 2 rollout. Merge order within F04 Part B: TASK-F04-3 → **TASK-F04-4** → TASK-F04-3b.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspector sees the route on a map (Priority: P1)

As an inspector, from the Route screen I switch to a **Map** tab and see each stop as a numbered pin in the plan's order, my starting point (base or today-only origin), and the real driving line connecting them so I can understand the shape of my day at a glance.

**Why this priority**: The map is the headline value of 01.4 (criterion 01.A1) and is independent of reordering — it reads only the existing `GET /v1/inspector/day-plans/:date` response. It ships value even if reorder were deferred.

**Independent Test**: Open a published plan, tap the **Map** segment, confirm pins 1..N in `sequence` order, the origin marker, and a route line that follows streets (dashed for `approximate` legs); tap a pin to open its details.

**Acceptance Scenarios**:

1. **Given** a published plan with 3 stops that have coordinates and a `geometry` FeatureCollection, **When** the inspector opens the Map tab, **Then** three numbered pins ("1","2","3") appear in `sequence` order, the origin marker appears for `origin.source` `BASE`/`LAST_STOP`, and the route line is drawn — solid for real legs, dashed for legs with `properties.approximate === true`.
2. **Given** a stop with `missingCoordinates === true`, **When** the map renders, **Then** that stop has no pin and a note "{k} stop(s) aren't on the map: location not found" is shown; the List tab still lists it.
3. **Given** `env.mapboxToken` is empty, **When** the Map tab opens, **Then** "Map is temporarily unavailable." is shown and the List tab remains fully usable.
4. **Given** a plan whose `origin.source` is `LAST_STOP` (today, after the first check-in), **When** the map renders, **Then** there is no separate `origin` marker and the first (done) stop's `done` pin marks the continuation point (L-F04-07).
5. **Given** two stops at identical (or < 10 m) coordinates, **When** the map renders, **Then** collision offsets are applied via `applyCollisionOffsets`/`setOffset` (never `style.transform`), both markers have distinct `aria-label`s, and there is no line feature between them (L-F04-13).

---

### User Story 2 - Inspector reorders stops and sees the cost (Priority: P1)

As an inspector, I reorder the not-yet-started stops in my day by dragging them or using up/down arrows; the ETAs, the total driving time, the "+N min vs. suggested" delta, and any window-arrival warnings update instantly, locally, without a network call, so I can judge a change before committing to it.

**Why this priority**: This is criterion 01.A2 and the core of 01.3. It is independently testable against the plan's `routingInput` matrix with no backend dependency beyond the already-merged GET.

**Independent Test**: With a plan of ≥ 2 not-started stops, drag stop 3 above stop 2 (and separately use the arrows); verify ETAs now carry a "~" prefix, the summary shows "Finish ~hh:mm · +N min vs. suggested · N min driving", and a window overrun shows a per-stop warning without blocking.

**Acceptance Scenarios**:

1. **Given** a plan with one started/done stop X and not-started stops A, B, C, **When** the reorderable list renders, **Then** only A, B, C (`executionStatus === 'NOT_STARTED'`, derived live — DB11) have a drag handle and arrows; X is fixed at the top with no controls.
2. **Given** the inspector drags or arrows a stop into a new order, **When** the draft updates, **Then** `evaluateSequence` is called with `toOptimizerInput(plan, now)` and `buildLegOverrides(order, routingInput)` for both the new order and `suggestedOrder`, and the summary shows `deltaFinishMin = round((finishS(new) − finishS(suggested)) / 60)` rendered as "+12 min vs. suggested" / "−5 min vs. suggested" / "Same finish time as suggested" (criterion 01.A2).
3. **Given** a new order that makes stop B arrive after its window 10:00–12:00, **When** the draft is evaluated, **Then** the item shows "Would arrive after its window 10:00 am – 12:00 pm" (tone `warning`) and a summary line "Stop {n} would arrive after its window 10:00 am – 12:00 pm" where `{n}` is the position in the new order counting the fixed prefix, and **Save stays enabled** (criterion **DB3** — window overrun only warns, never blocks).
4. **Given** `routingInput` is `null` (fewer than two not-started stops, or a purged plan), **When** the list renders, **Then** there are no handles/arrows and the text "Reordering needs at least two stops with a location." is shown.
5. **Given** the data is a past date, **When** the Route renders, **Then** there are no reorder controls.
6. **Given** keyboard-only use, **When** the inspector focuses a handle and presses Space then Arrow keys then Space, **Then** the stop reorders with English screen-reader announcements and an `aria-live="polite"` summary "Stop moved to position N of M. Finish ~hh:mm, +N min vs. suggested."

---

### User Story 3 - Inspector saves the new order and handles conflicts (Priority: P1)

As an inspector, when I'm happy with a reorder I tap **Save order**; the server returns the final Directions ETAs. If my plan changed underneath me (another device, the OP recalculated, a stop was removed), I'm told and shown the fresh plan rather than silently overwriting it.

**Why this priority**: Saving is what makes 01.A2 durable, and safe conflict handling is a correctness/data-integrity requirement (criterion 4 of the task).

**Independent Test**: Reorder, Save → observe `PUT /v1/inspector/day-plans/:date/order` with `{ appointmentIds, basedOnVersion }` containing only the not-started stops, cache replaced with the response, draft cleared, success snackbar. Simulate 409/422 responses and confirm reload + message.

**Acceptance Scenarios**:

1. **Given** a dirty draft on version 3 with reorderable order [A,C,B], **When** the inspector taps Save, **Then** exactly one `PUT /v1/inspector/day-plans/:date/order` is sent with `{ appointmentIds: [A,C,B], basedOnVersion: 3 }` (only `executed: false` stops), the response replaces the cache via `setQueryData`, the draft is cleared, and a snackbar "Route saved. Finish 10:49 am." appears.
2. **Given** a Save that returns 200 with `violations`, **When** it completes, **Then** the snackbar is "Route saved. 1 stop arrives after its window." and the warnings from the response persist.
3. **Given** a Save that returns 409 `DAY_PLAN_VERSION_CONFLICT` or 409 `DAY_PLAN_STALE`, **When** it completes, **Then** the plan is re-fetched, the draft is discarded, and an alert "Your route was updated. Review it before saving your order." is shown (no overwrite).
4. **Given** a Save that returns 422 `DAY_PLAN_ORDER_MISMATCH`, **When** it completes, **Then** the plan is re-fetched and the alert "Your stops changed. Review the route and try again." is shown.
5. **Given** a Save that returns 422 `DAY_PLAN_DATE_IN_PAST`, **When** it completes, **Then** the plan is re-fetched and the screen becomes read-only.
6. **Given** a Save that returns a network error or 429, **When** it completes, **Then** the draft is kept and "Couldn't save. Check your connection and try again." / "Too many changes in a short time. Try again in a minute." is shown respectively.
7. **Given** the inspector is offline (`useIsOnline === false`), **When** they reorder, **Then** controls stay active (local calc) but Save is disabled with "Connect to save your order."
8. **Given** a dirty draft, **When** the inspector navigates away, **Then** `useUnsavedChangesPrompt` warns "You have unsaved changes to your route. Leave anyway?"

---

### User Story 4 - Live plan changes while editing; reset to suggested (Priority: P2)

As an inspector mid-edit, if the plan changes under me (new version, STALE, or a stop removed) my unsaved work is frozen or safely discarded with a clear message; I can also reset a manual order back to the suggested one.

**Why this priority**: Protects against silent data loss during concurrent changes and delivers "Reset to suggested order" (DB10). Builds on US2/US3 but is a distinct, testable slice.

**Acceptance Scenarios**:

1. **Given** a dirty draft on v3, **When** a refetch brings v4, **Then** the draft is **frozen**: alert "Your route was updated. Review it before saving your order." plus a "Review" button (discards and shows v4), and Save is disabled. **Given** no draft, a refetch to v4 is adopted silently.
2. **Given** a dirty draft, **When** a refetch shows the reorderable set changed (e.g. a stop was removed by CANT_DO or a check-in on another device), **Then** the draft is discarded immediately with "A stop was removed from your route. Your changes were discarded."
3. **Given** a dirty draft, **When** a refetch returns `status 'STALE'`, **Then** Save is disabled with "Updating your route…" until the new version arrives.
4. **Given** a check-in performed on **this** device (F03 local execution state marks a stop `IN_PROGRESS`), **When** it happens, **Then** that stop leaves `reorderableIds` immediately and moves to the fixed prefix; if it had been moved, the draft is discarded with the same "A stop was removed…" message.
5. **Given** a dirty draft, **When** the inspector taps "Reset to suggested order", **Then** the order becomes `alignOrder(suggestedOrder)` locally with no API call.
6. **Given** `manualOrder === true` and no draft, **When** the inspector taps "Reset to suggested order", **Then** a dialog "Reset to the suggested order? Your saved order will be replaced." confirms, then `POST /v1/inspector/day-plans/:date/recalculate` runs, the cache is replaced, and a snackbar "Route reset to the suggested order." appears.

---

### Edge Cases

- **0 or 1 reorderable stop**: no controls; map renders normally.
- **No base** (`origin.source 'NONE'`): no origin pin and no initial leg; local evaluation uses `originIndex` absent (first stop starts in its window).
- **Stops without coordinates**: remain in the list and are reorderable (they consume service time, D7) but never appear on the map.
- **More than 9 stops** (server heuristic optimizer, `matrixProfile 'driving'`): client is unchanged; `evaluateSequence` is O(n); dnd-kit `autoScroll` for long lists; PUT caps at 25 ids (contract) — above that the server 400s and the app shows "Couldn't save…".
- **Day rollover with a draft** (case 9): `RoutePage` date key changes; the exit prompt does not cover a key swap; the draft is discarded with the old plan (accepted; recorded in Risks).
- **Approximate plan**: local delta uses the approximate matrix; the "Approximate route: travel times are estimates" band persists.
- **Plan after purge** (`routingInput null`, `geometry null`): no reorder; pins only.
- **Timezones**: local ETAs (`serviceStartS` epoch) are formatted in `stop.timezone`; `finishEta` and greetings in `plan.timezone`.
- **Wide layout (iPad)**: map and list live in the `TodayLayout` detail pane; the master (Day Screen) stays visible; the save bar never covers the last item.

## Requirements *(mandatory)*

### Functional Requirements

#### Map (01.4)

- **FR-001**: The Route screen MUST offer a `Segmented` "List"/"Map" tab (`role="tablist"`), defaulting to List, with the choice persisted in `?view=list|map` (replace) so it survives back navigation.
- **FR-002**: The Map tab MUST be `React.lazy`-loaded so `mapbox-gl` is downloaded only when the inspector opens Map.
- **FR-003**: The map MUST render one numbered pin per plottable stop in `sequence` order, using `makeNumberedMarkerEl({ label, variant: 'stop'|'done'|'origin'|'group', ariaLabel })` with variants: `stop` (white with ring, number in `hsl(var(--primary))`, 36 px), `done` (grey, "✓"), in-progress (filled primary), `origin` (house icon, label "Start"). `aria-label` MUST be "Stop {n}, {address}, ETA {hh:mm}" / "Start: {label}".
- **FR-004**: Marker colors MUST come from CSS (`hsl(var(--primary))`), and our code MUST NOT set `style.transform` on any marker; collision between near-identical coordinates MUST use `applyCollisionOffsets`/`setOffset` only (L-F04-13).
- **FR-005**: The route line MUST be drawn from `plan.geometry` via a GeoJSON line layer with **two** layers added once: a solid layer (`filter ['!=', ['get','approximate'], true]`) and a dashed layer (`line-dasharray [0.5, 2]`, `filter ['==', ['get','approximate'], true]`); `line-color` MUST be produced by `hslTripletToMapboxColor` (comma-form HSL, e.g. `hsl(221, 83%, 53%)`, lesson #1302) — never a space-separated HSL in `paint`. `null`/no geometry MUST produce an empty FeatureCollection (pins only).
- **FR-006**: The camera MUST fit pins + origin on load and on save, respect the first user gesture (then stop auto-fitting), and expose a "Fit route" control to re-fit; it MUST support 0 points (`AU_CENTRE`), 1 point (`flyTo` zoom 15), and many (`fitBounds` `maxZoom 15`, padding 48).
- **FR-007**: Tapping a pin MUST show a chip ("Stop {n} · ETA {hh:mm}", address, window) with "Open details" → `/schedule/{id}`, dismissible by X or by tapping the map.
- **FR-008**: The map MUST handle: no token → "Map is temporarily unavailable."; load error → "Map failed to load. Check your connection." + "Retry"; no plottable pins → "None of today's stops have a location on the map."; stops without coordinates → "{k} stop(s) aren't on the map: location not found".
- **FR-009**: When a reorder draft is dirty, map pins MUST renumber by the local order and the route line MUST be hidden (empty `setData`) with a chip "Save to update the route line".
- **FR-010**: The map container MUST be `aria-label="Route map"`, pins MUST be focusable `<button>`s, and all information on the map MUST also exist in the List tab (the map is complementary).

#### Reorder (01.3)

- **FR-011**: The reorderable set MUST be derived **live** (DB11): only stops with `executionStatus === 'NOT_STARTED'` are reorderable; any other status (DONE, in-progress) — including a stop checked in on **this** device via the F03 local execution state — is fixed at the top. Reorder controls appear only when `canReorder` (≥ 2 reorderable stops with a location) and the date is ≥ today.
- **FR-012**: Each reorderable row MUST provide a 44×44 drag handle (`GripVertical`, `touch-action: none` on the handle only, `aria-label="Drag to reorder stop {n}"`) and 44×44 up/down arrows ("Move stop {n} up"/"down", disabled at the prefix/end bounds).
- **FR-013**: `@dnd-kit` MUST be configured with a `PointerSensor` (`activationConstraint { delay: 150, tolerance: 5 }`, so it does not steal scroll), a `KeyboardSensor` (`sortableKeyboardCoordinates`), `verticalListSortingStrategy`, `restrictToVerticalAxis` + `restrictToParentElement` modifiers, `autoScroll`, and English `accessibility.announcements` + `screenReaderInstructions`.
- **FR-014**: Dragging MUST honor `prefers-reduced-motion` (no `DragOverlay`/`dropAnimation`, no `transform` transition).
- **FR-015**: Reordering MUST recompute **locally** with `evaluateSequence({ ...toOptimizerInput(plan, now), earliestDepartureS }, order, { legTravelS: buildLegOverrides(order, plan.routingInput) })` — `buildLegOverrides` uses `routingInput.legTravelS` (Directions) for adjacent pairs unchanged from the saved order and the matrix (`travelS`) for changed pairs; `toOptimizerInput(plan, now)` sets `earliestDepartureS = max(now, routingInput.earliestDepartureAt)` for today. The identical criterion MUST be applied to both the new order and `suggestedOrder`.
- **FR-016**: During editing, ETAs and legs MUST come from the local evaluation, prefixed with "~", with distance omitted (the matrix holds time only); per-stop window warnings MUST be shown; the summary MUST show "Finish ~{hh:mm} · {+N min vs. suggested} · {drive} driving".
- **FR-017**: A sticky save bar MUST appear only when the draft is dirty, offering "Discard" and "Save order" (with `aria-busy`/disabled on submit to prevent double-submit), the short delta, an offline-disabled state, and a frozen state for new-version/STALE.
- **FR-018**: Save MUST send only `executed: false` stops in the new order with `basedOnVersion = plan.version`, with no `Idempotency-Key` (server treats same-order replay). It MUST replace the cache on 200 and handle 409 `DAY_PLAN_VERSION_CONFLICT`/`DAY_PLAN_STALE`, 422 `DAY_PLAN_ORDER_MISMATCH`/`DAY_PLAN_DATE_IN_PAST`, network and 429 per US3.
- **FR-019**: "Reset to suggested order" MUST reset a local draft to `alignOrder(suggestedOrder)` without an API call; with a saved `manualOrder` and no draft it MUST confirm, then call `POST /v1/inspector/day-plans/:date/recalculate` and replace the cache.
- **FR-020**: A dirty draft MUST be frozen on a new version (with a "Review" escape), discarded when the reorderable set changes (with a message), and Save disabled while STALE, per US4.

#### Shared & offers (no regression)

- **FR-021**: The offers-map hooks/markers/colors MUST be moved to `src/lib/map/` (via `git mv` + generalization) and the offers feature MUST consume them from `@/lib/map` with no visible behavior change; existing offers tests MUST stay green.
- **FR-022**: The reorder logic MUST reuse `toOptimizerInput`, `buildLegOverrides`, `evaluateSequence`, and `RouteOrderMismatchError` from `@properfy/shared` (already merged by F04-1/F04-2) — it MUST NOT reimplement them.
- **FR-023**: The bundle impact of importing `route-planning` from the shared barrel MUST be measured per the Verification checklist; if the entry chunk grows > 5 kB gzip or `route-planning` lands in the entry chunk, the `@properfy/shared/route-planning` subpath export MUST be added (conditional +0.25).

### Key Entities *(include if feature involves data)*

- **DayPlanResponse / DayPlanStop / DayPlanGeometry / DayPlanRoutingInput**: already defined in `@properfy/shared` (`schemas/day-plan.ts`, `api-types.ts`); consumed read-only. No new entity, table, column, or `api-types` change is introduced.
- **Reorder draft (client-only state)**: `{ order: appointmentId[], baseVersion: number }` held by `useReorderDraft`; never persisted except via the existing `PUT …/order`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the Map tab, pins appear in plan `sequence` order with the origin and the real driving line (dashed for approximate legs) — **criterion 01.A1 (map part)**.
- **SC-002**: Reordering (drag or arrows) recomputes instantly with no API call and shows the finish delta ("+N min vs. suggested") and driving total; Save persists the order (`manual`) and returns final ETAs — **criterion 01.A2**.
- **SC-003**: A window overrun shows "Stop n would arrive after its window …" and never blocks Save — **criterion DB3**.
- **SC-004**: Version conflict, STALE, and mismatch reload the plan and warn without losing data from another source.
- **SC-005**: Offers have no regression (offers tests green with the new imports); no marker carries `style.transform`; every map `paint` uses comma-form HSL.
- **SC-006**: `pnpm --filter @properfy/shared build && pnpm --filter pwa lint typecheck test build && pnpm --filter pwa check:ds` are green; the PWA entry chunk grows ≤ 5 kB gzip and `route-planning` is not in the entry chunk (else the subpath export is applied); QA M1–M4 and R1–R11 completed.

## Assumptions

- **L-F04-03 variant = Plan A (confirmed before start)**: the Mapbox consultation allows forwarding the raw matrix to the client, so `routingInput` (with `travelS`, `legTravelS`, `earliestDepartureAt`, `weights`) is present in the GET and reordering recomputes **locally**. Verified in merged `packages/shared/src/schemas/day-plan.ts` (`dayPlanRoutingInputSchema`, `toOptimizerInput`, `buildLegOverrides`) and in the exported-contracts example. Variant B (server `POST …/order/preview`) is **not** used.
- **Shared helpers already merged**: `toOptimizerInput(plan, now)` and `buildLegOverrides(order, routingInput)` live in `@properfy/shared` (`schemas/day-plan.ts`); `evaluateSequence`, `RouteOrderMismatchError`, `optimizeRoute`, and types live in `@properfy/shared` (`route-planning/`). The task file's older step wording ("`buildLegOverrides(plan, order)` in `reorder-draft.ts`") is superseded — the PWA `reorder-draft.ts` wraps the shared helpers and does not redefine them. `toOptimizerInput(plan, now)` already folds in the `earliestDepartureS = max(now, earliestDepartureAt)` logic, so a separate `resolveEarliestDeparture` is only a thin adapter if needed.
- **Dependencies merged and in production**: TASK-F04-3 (Route page, `useDayPlan`, fixture, `StopCard`), TASK-F04-2 (`PUT …/order`, `POST …/recalculate`, `routingInput`, `geometry`, `legTravelS`, live reorderable set, `earliestDeparture`), TASK-F04-1 (shared optimizer). `api-types` are current for these routes on `origin/develop` (2fb00e3d).
- **Multi-tenant scope**: `DayPlan`/`DayPlanStop` are platform-scoped (no `tenant_id`) because the inspector is cross-tenant; all day-plan endpoints are `INSP`-scoped to the caller's own plan. This feature only consumes those `INSP` endpoints and introduces no new entity or scope decision; the Mapbox token never reaches the PWA (the line arrives pre-computed).
- **New dependency**: `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/modifiers@9.0.0`, `@dnd-kit/utilities@3.2.2` (exact versions, all > 2 weeks old), decided in Q19. No other new dependency.
- **No backend/schema/api-types/migration/env change**; uses the existing public `VITE_MAPBOX_TOKEN` (per-environment). Rollout is the service-worker auto-update; rollback is reverting the PR (Route falls back to list-only; saved orders stay on the server).
- **Reduced-motion and iOS scroll**: drag uses `PointerSensor` `delay 150` + `touch-action` on the handle only so it does not steal scroll; `prefers-reduced-motion` disables drag animation.
- **Day-rollover-with-draft** is accepted as a known limitation (the draft is discarded with the old plan) and recorded under Risks, matching the task's edge case 9.
