# Tasks: Live Day screen (web)

**Input**: Design documents from `specs/060-f05-2-live-day-screen/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Tests**: INCLUDED — TDD is mandatory (Constitution III + CLAUDE.md). Every implementation task is preceded by its red test task.

**Scope guard**: web-only (`apps/web`). No backend / schema / OpenAPI / `api-types` change. `git diff --stat origin/develop...` must stay < 150 files. Lint runs with `--max-warnings 0`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 for story phases only

---

## Phase 1: Setup

- [ ] T001 Confirm the worktree baseline is green: `@properfy/shared` and `@properfy/frontend-standards` built to `dist/`, and `pnpm --filter web typecheck lint` clean (delegated to the setup subagent; do not proceed until it reports pass).
- [ ] T002 Create the feature directory skeleton `apps/web/src/features/live-day/{hooks,lib,components,pages}/` (empty, filled by later tasks) and confirm `apps/web/src/components/map/` is writable.

---

## Phase 2: Foundational (blocking prerequisites for ALL user stories)

**Purpose**: the shared `components/map` primitives, the data hook, and the pure selectors every story depends on. No story can be implemented until these are green.

### Map primitives (`apps/web/src/components/map/`)

- [ ] T003 [P] Write red test `apps/web/src/components/map/RouteLayer.test.tsx` covering: mount → `addSource('live-route-<id>', {type:'geojson',data})` + `<id>-solid` (filter `['!=',['get','approximate'],true]`) and `<id>-dashed` (filter `['==',...true]`, `line-dasharray [1.5,1.5]`); `line-color` must match `/^hsl\(\d+, \d+%, \d+%\)$/` (space-form rejected, no paint); re-render new geometry → `setData` (no re-add); `geometry null` → `setData(EMPTY)`; unmount → remove layers+source; `onClick` → `on('click', layer)` on both + `off` on unmount + pointer cursor on `mouseenter`; `emphasis 'muted'` → opacity 0.35, `'normal'` → 0.9, `'selected'` → width 5; `stops variant 'dots'` → circle source/layer (`radius 4`, stroke `#FFFFFF`); map recreated → idempotent re-add; `label` → `mouseenter` opens popup "Jane Doe", `mouseleave` closes; no `label` → no popup.
- [ ] T004 Implement `apps/web/src/components/map/RouteLayer.tsx` to green T003 (port the PWA `useOfferRoute` idempotent add/setData pattern; `beforeId` first `symbol` layer; comma-HSL paint only; never call Mapbox Directions).
- [ ] T005 [P] Add red cases to `apps/web/src/components/map/MapMarker.test.tsx`: `headColor '#0B628E'` on `icon` variant colours head+tail; `outlineColor '#A51D1D'` → 3 px box-shadow/border on head; `innerText '3'` on circle variant renders "3" instead of `mdi-map-marker`; `innerIcon 'mdi-check-bold'` renders the icon; `aria-label` = `label`. Existing cases stay green.
- [ ] T006 Implement additive props `headColor`, `outlineColor`, `innerText`, `innerIcon` in `apps/web/src/components/map/MapMarker.tsx` to green T005 without changing existing behaviour.
- [ ] T007 [P] Write red test `apps/web/src/components/map/marker-offsets.test.ts` with the `computeMarkerOffsets` cases moved from the appointments map test.
- [ ] T008 Move `computeMarkerOffsets` into `apps/web/src/components/map/marker-offsets.ts` (content unchanged), switch `apps/web/src/features/appointments/pages/AppointmentMapPage.tsx` to import it from `components/map`, and export it from `apps/web/src/components/map/index.ts`. Confirm `AppointmentMapPage.test.tsx` stays green with no assertion change.
- [ ] T009 [P] Write red test `apps/web/src/components/map/MapScreenLayout.test.tsx`: no `storageKey` → reads/writes `sessionStorage['appointments-map.filter-panel.width']` (jsdom storage guarded per memory); `storageKey 'live-day.panel.width'` → uses that key only; viewport 375 px (`matchMedia('(min-width:768px)')` false) → full-width panel, `max-h-[50dvh]`, no resize handle, "Map / List" button with `aria-expanded` toggling collapse, `document.documentElement.scrollWidth ≤ window width`; viewport 1280 px → floating card, no "Map / List". Existing cases stay green.
- [ ] T010 Implement `storageKey?` (default `'appointments-map.filter-panel.width'`) and the collapsible mobile mode (< `md`) in `apps/web/src/components/map/MapScreenLayout.tsx` to green T009; `index.ts` already exports it.

### Data hook + pure selectors (`apps/web/src/features/live-day/`)

- [ ] T011 [P] Write red test `apps/web/src/features/live-day/lib/liveDayView.test.ts` for `filterInspectors`, `routesToDraw` (selected-only / all / all+selected emphasis), `formatDelay` (+22/On time/On time/—), `stopTimeLabel` (DONE/DONE-no-exec/CURRENT±startedAt/OPEN/REMAINING/out-of-plan/past-day, all in `stop.timezone`, Perth fixture), `sortInspectors` (severity rank then name; DELAY+CANT_DO uses CANT_DO rank), `canShowAllRoutes` (40 true / 41 false).
- [ ] T012 Implement `apps/web/src/features/live-day/lib/liveDayView.ts` (pure, importing shared `LIVE_DAY_ALERT_TYPE_ORDER`, `LIVE_DAY_SHOW_ALL_MAX`, timezone format helpers) to green T011.
- [ ] T013 [P] Write red test `apps/web/src/features/live-day/hooks/useLiveDay.test.tsx`: `refetchInterval 30_000` + `refetchIntervalInBackground false` for today and tomorrow; `false` for a past day; `queryKey ['live-day', date, geometryMode, selectedId]`; `geometryMode` derivation (all/selected+inspectorId/none) and that `includeGeometry`/`inspectorId` are sent only then; selection J→T issues `selected&inspectorId=T` while `keepPreviousData` holds J; toggling show-all → `all`, off with J selected → `selected&inspectorId=J`; network error after success → keeps `data`, exposes `isRefetchError`+`dataUpdatedAt`; `isLive` from server `today` (browser clock 2026-11-10, `today '2026-11-05'`: `date '2026-11-06'`→30_000, `'2026-11-04'`→false); invalid URL `date` → first request omits `date`.
- [ ] T014 Implement `apps/web/src/features/live-day/hooks/useLiveDay.ts` to green T013 (typed `api.GET('/v1/dashboard/live-day', …)`, `keepPreviousData`).
- [ ] T015 [P] Write red test `apps/web/src/features/live-day/hooks/useFrozenOrder.test.tsx`: holds order while `isInteracting` (pointer over / focus inside), releases on first non-interacting render and on filter/date change and on unmount.
- [ ] T016 Implement `apps/web/src/features/live-day/hooks/useFrozenOrder.ts` to green T015.

**Checkpoint**: map primitives, data hook, and selectors all green before any story phase.

---

## Phase 3: User Story 1 — Live map + list with derived state (Priority: P1) 🎯 MVP

**Goal**: AM/OP open Live Day and see the roster list + map pins with state/progress/delay/alerts, auto-refreshing every 30 s. Covers 01.A4 (state flips on check-in/out) and the alert-rendering half of 01.A5 (alert icons + `sr-only` summary appear on rows). The "Needs attention" filter *toggle* UX (which hides non-alerting rows) is implemented in US3 (T037/T038); the underlying `filterInspectors` selector is foundational (T011/T012).

**Independent test**: mocked `live-day` response renders one row per inspector (name, colour dot, state label, progress, delay, alert icons) and one pin per inspector with a known location; a sequence of mocked polls flips a row/pin NOT_STARTED→AT_PROPERTY→IN_TRANSIT→DONE_FOR_DAY.

- [ ] T017 [P] [US1] Write red test `apps/web/src/features/live-day/components/LiveDayStateBadge.test.tsx` (icon + `LIVE_DAY_STATE_LABELS` text per state; "At a property" etc.).
- [ ] T018 [US1] Implement `apps/web/src/features/live-day/components/LiveDayStateBadge.tsx` to green T017.
- [ ] T019 [P] [US1] Write red test `apps/web/src/features/live-day/components/LiveDayInspectorRow.test.tsx`: colour dot (`hex`, `aria-hidden`), name, state badge, progress bar (`role="progressbar"`, aria valuemin/max/now, `aria-label "{name} progress"`) + "1 of 3 done", delay text, alert icons with `sr-only` summary, route chips (Approximate/out-of-date/DRAFT/NONE-today vs NONE-future), "Route infeasible" badge + tooltip from `routeViolations` (not counted in needs-attention), "Location unknown" when `NONE`.
- [ ] T020 [US1] Implement `apps/web/src/features/live-day/components/LiveDayInspectorRow.tsx` to green T019.
- [ ] T021 [P] [US1] Write red test `apps/web/src/features/live-day/pages/LiveDayPage.test.tsx` (US1 subset, `createMemoryRouter`): loading skeleton (6 rows `aria-busy`, map "Loading map..."); success (title "Live Day", subtitle "Last known location · updates every 30 s", one row per inspector, one `MapMarker` per inspector with `lastKnown.source ≠ 'NONE'`); pin `aria-label` "Jane Doe — At a property, 1 of 3 done, 22 min late. Last known location: check-in at 10:17."; `headColor` = state colour, `needsAttention` red badge; 01.A4 sequence of mocked polls flips state within the poll; "Updated just now" → fake +45 s → "Updated 45 s ago" (no `aria-live`); polling pauses on hidden tab.
- [ ] T022 [US1] Implement `apps/web/src/features/live-day/components/LiveDayPanel.tsx` (header with help tooltip + subtitle + "Updated …", summary counters, list container) and `apps/web/src/features/live-day/pages/LiveDayPage.tsx` (compose `MapScreenLayout fillParent` + `MapContainer` + inspector pins via `MapMarker` with `computeMarkerOffsets`, wire `useLiveDay` with derived `geometryMode`/`selectedId`, first-load camera `fitBounds`/`flyTo`, polling never moves camera) to green T021.
- [ ] T023 [P] [US1] Write red test `apps/web/src/app/router.test.tsx` (or extend existing): `/live-day` with CL_ADMIN → `AuthGuard` denies; with OP → renders the page (lazy).
- [ ] T024 [US1] Add the `/live-day` lazy route with `AuthGuard roles={[AM, OP]}` and `Loadable(lazyRetry(() => import('@/features/live-day/pages/LiveDayPage')))` to `apps/web/src/app/router.tsx` (Workload-pattern comment) to green T023.
- [ ] T025 [P] [US1] Update `apps/web/src/components/shell/Sidebar.roles.test.tsx` (no mocks, `MemoryRouter`) + `Sidebar.test.tsx`: AM/OP open the Dashboard flyout and find `menuitem` "Live Day" `href="/live-day"` positioned after Overview and before Analytics (and before Inspector notices), group active on `/live-day`; CL_ADMIN/CL_USER absent; INSP keeps the plain item; `filterNavItems(NAV_ITEMS,'AM')` contains a child `to:'/live-day'` (presence only).
- [ ] T026 [US1] Add the Live Day child `{ icon:'mdi-map-clock-outline', label:'Live Day', to:'/live-day', roles:[AM,OP] }` to the Dashboard `submenu` in `apps/web/src/components/shell/Sidebar.tsx`, immediately after "Overview", to green T025.

**Checkpoint**: MVP — AM/OP see the live roster + pins, polling works, state flips on check-in/out, access is gated. Independently demoable.

---

## Phase 4: User Story 2 — Inspector route + stop detail (Priority: P2)

**Goal**: selecting an inspector shows their detail (route drawn, stop list, alert list, camera fit, back nav), with same-tab appointment links.

**Independent test**: with a mocked response including one inspector's geometry, clicking the row draws a `selected` `RouteLayer`, numbered stop markers, calls `fitBounds` once, moves focus to the `<h2>`, and renders alert/stop appointment codes as same-tab links.

- [ ] T027 [P] [US2] Write red test `apps/web/src/features/live-day/components/LiveDayStopList.test.tsx`: ordered stops; DONE check + "Done 09:02–09:41"; CURRENT `aria-current="step"` + "In progress since 10:17"; REMAINING "ETA 11:15"; out-of-plan chip "Not in route yet"; no-coordinate "Location not found for this address"; appointment code `<Link to="/appointments/<id>">` (same tab); past-day "Planned 11:15".
- [ ] T028 [US2] Implement `apps/web/src/features/live-day/components/LiveDayStopList.tsx` to green T027.
- [ ] T029 [P] [US2] Write red test `apps/web/src/features/live-day/components/LiveDayAlertList.test.tsx` for all 7 alert copies (FR-017), each appointment code a same-tab `<Link>` incl. `CANT_DO` not in `stops`; `LATE_NOTICE` uses server `estimatedArrivalAt` in the stop tz (never `predictedStartAt+minutes`); `GEOFENCE` `radiusMeters null` omits the limit; `CANT_DO` note italic; DELAY override "(limit 15 min, custom)"; NOT_STARTED past-day copy; OUT_OF_WINDOW `thresholdMinutes null` copy.
- [ ] T030 [US2] Implement `apps/web/src/features/live-day/components/LiveDayAlertList.tsx` to green T029 (use `LIVE_DAY_ALERT_LABELS`, `FIELD_ISSUE_REASON_LABELS`/`LATE_NOTICE_REASON_LABELS` where relevant). It MUST render alerts read-only — no acknowledge/dismiss control, not even per session (FR-018).
- [ ] T031 [P] [US2] Write red test `apps/web/src/features/live-day/components/LiveDayInspectorDetail.test.tsx`: `<h2 tabIndex=-1>` with name/state/last-known/progress/delay; "Last known location: …" variants (check-out+address, BASE "base (no check-in yet)", "Start of day" → "today's start address (no check-in yet)"); composes alert list + stop list; "Back to all inspectors" button present.
- [ ] T032 [US2] Implement `apps/web/src/features/live-day/components/LiveDayInspectorDetail.tsx` to green T031.
- [ ] T033 [P] [US2] Extend `LiveDayPage.test.tsx` (US2 cases): select row → inspector view, focus `<h2>`, `RouteLayer` `emphasis 'selected'`, numbered stop markers, `fitBounds` once; "Back to all inspectors"/Escape → list, focus back to the row, `RouteLayer` removed (when show-all off); row with `geometryIncluded false` never draws `RouteLayer` and shows "Loading route…" until geometry arrives; clicking the route selects the inspector; polling with equal data does not re-call `fitBounds`/`flyTo`; `?inspector=` deep link selects; selection updates `?inspector` with `replace`; selected inspector vanishing on a poll → back to list + `role="status"` "{name} no longer has work on this day."; date change keeps/clears selection per existence.
- [ ] T034 [US2] Wire selection + inspector-detail view + route drawing + camera + URL `?inspector` into `LiveDayPanel.tsx`/`LiveDayPage.tsx` to green T033 (stop pins via `MapMarker` circle variant per FR-027; selected-stop pin click scrolls+focuses the row).

**Checkpoint**: single-inspector route/stop/alert detail works end to end.

---

## Phase 5: User Story 3 — Date navigation, all-routes, needs-attention (Priority: P3)

**Goal**: date selector anchored on server today (+ tomorrow), "Show all routes" (≤ 40) with legend, "Needs attention" filter, stable order during interaction, URL params.

**Independent test**: changing date issues a new request and stops polling on past days; "Show all routes" sends `includeGeometry=all` and draws one route per visible inspector with a legend; "Needs attention" narrows list + pins; order freezes under the cursor.

- [ ] T035 [P] [US3] Write red test `apps/web/src/features/live-day/components/LiveDayLegend.test.tsx`: 4 state items always; "Routes" section only with show-all (names + dots); > 12 up to 40 → scroll (`max-h` 8 rows) + `aria-label="Route colours"`.
- [ ] T036 [US3] Implement `apps/web/src/features/live-day/components/LiveDayLegend.tsx` to green T035.
- [ ] T037 [P] [US3] Extend `LiveDayPage.test.tsx` (US3 cases): date selector → yesterday request + polling stops; "Today" disabled when `date===today`; `DateInput.max = today+1` regardless of selected date; `?date=` beyond tomorrow → 400 `LIVE_DAY_DATE_TOO_FAR` → URL `?date=<today>` replace + `role="status"` "That day isn't available yet. Showing today." (no error EmptyState); "Needs attention" `aria-pressed` + "(2)" counter, filters rows + pins, 0 results copy today vs past day + "Show everyone"; `routeApproximate true` chip + tooltip; `planStatus` chips incl. future-NONE "Route not generated yet — plans publish at 19:30" and DRAFT "Not published yet"; "Show all routes" `aria-pressed` → `includeGeometry=all`, one `RouteLayer` per visible inspector (`variant 'dots'`) + legend, off → removed; teto: 41 visible → toggle `aria-disabled` + tooltip "Narrow the list (Needs attention) to show all routes — up to 40 at once", `routes=all` in URL ignored with 41; order stable while focus in list, reorders after leaving / on filter change.
- [ ] T038 [US3] Wire the date control (`DateInput` "Day" + "Today"), the "Needs attention" + "Show all routes" toggles (with `canShowAllRoutes` gating + tooltip), `useFrozenOrder`, legend, URL params (`date`/`attention`/`routes`) and the `LIVE_DAY_DATE_TOO_FAR` re-anchor banner into `LiveDayPanel.tsx`/`LiveDayPage.tsx` to green T037.

**Checkpoint**: full date + overlay + filter controls operate; URL round-trips.

---

## Phase 6: User Story 4 — Resilience, ETA footer, a11y, mobile (Priority: P4)

**Goal**: robust data states, route-reliability footer, asserted a11y invariants (no axe engine), keyboard, 375 px collapsible panel.

**Independent test**: polling error banner shows without stealing focus; ETA footer renders each status; a11y invariants (roles/aria/keyboard) asserted on list/detail/legend; 375 px collapses the panel with no horizontal scroll.

- [ ] T039 [P] [US4] Write red test `apps/web/src/features/live-day/hooks/useEtaAccuracy.test.tsx`: `GET /v1/day-plans/eta-accuracy` with `days 30`, `staleTime 10 min`, no `refetchInterval`.
- [ ] T040 [US4] Implement `apps/web/src/features/live-day/hooks/useEtaAccuracy.ts` to green T039.
- [ ] T041 [P] [US4] Write red test `apps/web/src/features/live-day/components/RouteEtaAccuracyFooter.test.tsx`: OK / ABOVE_THRESHOLD (+ "Above the 10 min target", warning) / INSUFFICIENT_DATA / `sampleSize 0` "no data yet" / error "unavailable" / loading "Route ETA accuracy…".
- [ ] T042 [US4] Implement `apps/web/src/features/live-day/components/RouteEtaAccuracyFooter.tsx` to green T041 and mount it as the panel footer in `LiveDayPanel.tsx`.
- [ ] T043 [P] [US4] Extend `LiveDayPage.test.tsx` (US4 cases): first-load 500 → EmptyState "We couldn't load the Live Day." + "Try again" (refetch); empty roster → "No inspectors have work on {EEE d MMM}."; polling error (200 then 500) → list stays + `role="status"` "Couldn't refresh. Showing data from 10:31." + "Retry", clears on success, no focus steal; map-token-missing path leaves list usable.
- [ ] T044 [US4] Implement the data-state surfaces (initial error, empty, polling-error banner) in `LiveDayPanel.tsx`/`LiveDayPage.tsx` to green T043.
- [ ] T045 [P] [US4] Add a11y-invariant assertions to `LiveDayPage.test.tsx` (list, detail, legend) — no axe engine (repo has none; see research D-R10): assert keyboard order + Enter/Space select + Escape back + focus moves; progressbar roles (`role="progressbar"`, aria valuemin/max/now, `aria-label`); `aria-pressed` toggles; `aria-current="step"`; colour never the sole signal (text/name present).
- [ ] T046 [US4] Resolve any a11y/keyboard findings from T045 across the Live Day components (no new behaviour; ARIA/focus wiring only).
- [ ] T047 [P] [US4] Extend `LiveDayPage.test.tsx` mobile case: 375 px → bottom panel + "Map / List" (`aria-expanded`), collapse shows the map, no horizontal scroll, touch targets ≥ 44 px on rows/toggles/"Map / List"; legend collapses into a "Legend" button.
- [ ] T048 [US4] Wire the Live Day page to `MapScreenLayout storageKey='live-day.panel.width'` with the mobile collapsible mode + the mobile legend button to green T047.

**Checkpoint**: production-ready — resilient, accessible, mobile, with the ETA footer.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T049 Update `apps/web/CLAUDE.md` (X00 rule): `components/map/RouteLayer` (first web line layer; comma-HSL paint; solid/dashed by `approximate`), the shared per-inspector palette, 30 s visible-tab polling, "Live Day" in the Dashboard group, `MapScreenLayout` `storageKey` + collapsible mobile (L-F05-04), and "today always from the server" (`data.today`, L-F05-05).
- [ ] T050 Run full gates inside the worktree via a subagent (condensed summary): `pnpm --filter @properfy/shared build`; `pnpm --filter web typecheck`; `pnpm --filter web lint` (`--max-warnings 0`); `pnpm --filter web test`. Fix any failure and re-run until green.
- [ ] T051 Verify scope guard: `git diff --stat origin/develop... | tail -1` < 150 files and no change under `apps/backend/`, `packages/shared/`, `openapi.json` or `api-types.ts`.
- [ ] T052 Manual browser QA per quickstart.md (4 states; today/yesterday/tomorrow; show-all; selection; same-tab appointment links; hidden-tab polling pause; `?date=` far-future re-anchor; `/map` desktop width + 375 px). Screenshots kept out of the commit.

---

## Dependencies & order

- Phase 1 (Setup) → Phase 2 (Foundational) → Phases 3–6 (stories, in priority order) → Phase 7 (Polish).
- Within Phase 2: T003/T005/T007/T009/T011/T013/T015 (`[P]` red tests) can be written together; each impl task depends only on its own test and its own file.
- US1 depends on Foundational (RouteLayer not strictly needed for US1 list/pins, but MapMarker additions, MapScreenLayout, `useLiveDay`, selectors, `useFrozenOrder` are). US2 depends on US1 + RouteLayer. US3 depends on US1 (+US2 selection for the all-routes emphasis). US4 depends on US1.
- MVP = Phase 1 + Phase 2 + Phase 3 (US1).

## Parallel opportunities

- All Phase 2 red test tasks (`[P]`) in parallel.
- Within each story, the `[P]` test tasks for distinct components in parallel; impl tasks that touch `LiveDayPanel.tsx`/`LiveDayPage.tsx` are serialized (shared file).

## Summary

- Total tasks: **52** (Setup 2, Foundational 14, US1 10, US2 8, US3 4, US4 10, Polish 4).
- Per story: US1 = 10 (T017–T026), US2 = 8 (T027–T034), US3 = 4 (T035–T038), US4 = 10 (T039–T048).
- MVP scope: US1 (live map + list + polling + access).
