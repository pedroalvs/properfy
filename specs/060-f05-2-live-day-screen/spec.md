# Feature Specification: Live Day screen (web)

**Feature Branch**: `060-f05-2-live-day-screen`
**Created**: 2026-11-06
**Status**: Draft
**Input**: TASK-F05-2 (`fase2-etapa1/tarefas/F05-tarefas.md`). Web-only consumer of the TASK-F05-1 backend contract (merged to `origin/develop` @ `93179912`, PR #1348). Covers client-facing scope items 01.8, 01.9, 01.11 and the "real-time inspector map and routes" phrase of delivery D. Acceptance criteria **01.A4** and **01.A5** (display side).

## Context & scope

Properfy Operations (Admin Master / Operator) need a single screen that shows the current working day as it happens: where each inspector is (last known location), what state they are in, how far along their stops they are, how late they are running, and which situations need attention — refreshed automatically, with the planned route drawable per inspector or for everyone.

This feature is **web-only**. It ships no backend, schema, OpenAPI or `api-types` change. It consumes three already-merged endpoints and the shared Live Day contract (schemas, enums, per-inspector colour palette, caps) delivered by TASK-F05-1, plus the F04 `GET /v1/day-plans/eta-accuracy` endpoint.

Consumed contracts (no new ones):

- `GET /v1/dashboard/live-day?date=&includeGeometry=none|selected|all&inspectorId=` → `liveDayResponseSchema`
- `GET /v1/day-plans/eta-accuracy?days=30` → `routeEtaAccuracySchema`
- Shared from `@properfy/shared`: `liveDayResponseSchema`/`LiveDayResponse` and nested types; `LiveDayInspectorState`, `LiveDayStopProgress`, `LiveDayAlertType`, `LiveDayLastKnownSource`, `LiveDayThresholdSource`, `LiveDayGeofencePhase`; `LIVE_DAY_ALERT_TYPE_ORDER`, `LIVE_DAY_STATE_LABELS`, `LIVE_DAY_ALERT_LABELS`, `LIVE_DAY_SHOW_ALL_MAX` (40), `LIVE_DAY_GEOMETRY_ALL_MAX_INSPECTORS` (60); `INSPECTOR_ROUTE_PALETTE`, `inspectorRouteColorIndex(id)`, `inspectorRouteColor(id) → { mapbox, hex, index }`; `dayPlanGeometrySchema` / `DayPlanGeometry`.

Out of this task (owned by TASK-F05-3): the "Locked time" panel tab, the inspector-drawer "Live Day alerts" override section, the "Platform settings" default section, the `?open=<id>` deep-link on the inspector list.

## Clarifications

### Session 2026-11-06

No external clarification was required: the task file (TASK-F05-2) specifies the behaviour exhaustively (D1–D21, L-F05-*, L-X01-*) and the TASK-F05-1 contract is already merged. The points where the snapshot task file diverged from the merged contract were resolved deterministically ("merged contract wins") and are recorded here and in Assumptions / Premises.

- Q: What inspector state label does `AT_PROPERTY` use? → A: "At a property" — from the merged shared `LIVE_DAY_STATE_LABELS` (the task-file snapshot's "At property" is stale; the web renders from the shared labels).
- Q: How is "live" (polling-eligible) decided given the server sends both `today` and `isToday`? → A: `isLive = date >= data.today`, so tomorrow also polls; `isToday` alone would exclude tomorrow.
- Q: Is `routeApproximate` ever false in practice? → A: No for now — F04 "Plan B" serves only in-memory straight-line geometry, so `routeApproximate` is always true and every row shows "Approximate route"; `RouteLayer` still handles both solid and dashed layers keyed on each feature's `properties.approximate`.
- Q: Where does the "Live Day" menu item go, now that F02's "Inspector notices" is already merged? → A: Between "Overview" and "Inspector notices" (canonical X01 order documented in `Sidebar.tsx`).
- Q: How is the "0 axe violations" acceptance met, given the web workspace has no axe engine? → A: There is no axe tooling anywhere in the repo and prior analogous web features (F02-2, F03-4, F09-2) shipped without it; the a11y acceptance is met by asserting the concrete ARIA/keyboard invariants (progressbar roles, `aria-pressed`, `aria-current="step"`, focus order, same-tab links) in the component/page tests. No new test dependency is added.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operations watches the live day on a map and list (Priority: P1)

An Operator opens **Live Day** from the Dashboard group. The screen loads today's roster: one row per inspector who has live work on the day, and one map pin per inspector at their last known location. Each row shows the inspector's derived state (with icon + text), progress ("1 of 3 done"), accumulated delay, and alert icons. The list auto-refreshes every 30 seconds while the tab is visible, so the Operator sees check-ins and check-outs flow through without reloading.

**Why this priority**: This is the MVP and the core of 01.A4 and 01.A5 (display). Without the live map + list + polling, the screen delivers no value. It is independently demonstrable against the real backend by performing a check-in/check-out and watching the state change.

**Independent Test**: Load `/live-day` as AM/OP with a mocked `live-day` response; verify the list renders one row per inspector with name, colour dot, state label, progress bar and delay, one `MapMarker` per inspector whose `lastKnown.source ≠ 'NONE'`, and that the query polls every 30 s only while the tab is visible. With the real backend, a PWA check-in flips the row/pin to "At a property" within 30 s.

**Acceptance Scenarios**:

1. **Given** the Operator has AM or OP role, **When** they open the Dashboard group in the sidebar, **Then** a "Live Day" item appears between "Overview" and "Inspector notices" linking to `/live-day`; CL_ADMIN, CL_USER and INSP never see this item.
2. **Given** a CL_ADMIN navigates directly to `/live-day`, **When** the route renders, **Then** the `AuthGuard` denies access (same behaviour as `/inspector-workload`); an OP sees the page.
3. **Given** the `live-day` request is in flight on first load, **When** the page renders, **Then** the panel shows a 6-row skeleton with `aria-busy="true"` and the map shows "Loading map...".
4. **Given** a successful `live-day` response for today, **When** the page renders, **Then** the title is "Live Day", the subtitle is "Last known location · updates every 30 s", each inspector row shows name, the inspector's colour dot (shared `hex`), state label, "{done} of {total} done", delay ("+22 min" / "On time" / "—") and alert icons, and there is one inspector pin per inspector with a known location.
5. **Given** the page is showing today, **When** 30 seconds pass with the tab visible, **Then** a refetch occurs (`refetchInterval: 30_000`, `refetchIntervalInBackground: false`); with the tab hidden, polling pauses and resumes on focus.
6. **Given** a check-in happens for an inspector's stop (real backend or next mocked poll), **When** the next poll returns, **Then** that inspector's row and pin show "At a property"; a check-out with a remaining stop shows "In transit"; the last check-out shows "Done for the day". *(01.A4)*

---

### User Story 2 - Operations drills into one inspector's route and stops (Priority: P2)

The Operator clicks an inspector (row or pin). The panel switches to that inspector's detail: a heading with their name/state/last-known location/progress/delay, the alert list (each alert's appointment code is a same-tab link to the appointment), the ordered stop list (done with a check + real times, current highlighted, remaining with projected ETA), and the planned route drawn on the map in the inspector's colour, with the camera framing the route once. A "Back to all inspectors" button (and Escape) returns to the list.

**Why this priority**: The route + stop detail is the second half of the value (seeing *what* an inspector is doing, not just *that* they are behind). It is independently testable by selecting one inspector and asserting the route layer, stop list and alert texts.

**Independent Test**: With a mocked response including geometry for one inspector, click the row; assert focus moves to the `<h2>`, a `RouteLayer` is drawn with `emphasis 'selected'`, numbered stop markers appear, `fitBounds` is called exactly once, and each alert/stop appointment code is a `<Link to="/appointments/:id">`.

**Acceptance Scenarios**:

1. **Given** an inspector row, **When** the Operator clicks it, **Then** the panel shows the inspector view (focus on the `<h2>` name), the inspector's `RouteLayer` is drawn with `emphasis 'selected'`, numbered stop markers render, and the camera `fitBounds` is called once.
2. **Given** the inspector view is open, **When** the Operator presses "Back to all inspectors" or Escape, **Then** the list returns, focus goes back to the inspector's row, and the `RouteLayer` is removed (unless "Show all routes" is on).
3. **Given** the stop list, **When** it renders, **Then** each stop shows its sequence marker (number, check for `DONE`, "•" for out-of-plan), the appointment code as a same-tab `<Link to="/appointments/:id">`, agency, address, window "08:00–17:00" and the time label per its progress and the day (see FR time-label rules); the `CURRENT` stop has `aria-current="step"`.
4. **Given** an alert with an `appointmentId`, **When** it renders in the alert list, **Then** its appointment code is a same-tab `<Link to="/appointments/:id">`, including the `CANT_DO` alert whose appointment is no longer in `stops`.
5. **Given** an inspector row whose current response carries no geometry for them (`geometryIncluded false`), **When** it is selected, **Then** no `RouteLayer` draws and a subtle "Loading route…" indicator shows until the response that includes the geometry arrives.
6. **Given** the Operator clicks the drawn route line, **When** the click handler fires, **Then** that inspector is selected.

---

### User Story 3 - Operations navigates days and compares all routes (Priority: P3)

The Operator changes the day (past days and tomorrow), and toggles "Show all routes" to draw every visible inspector's route at once, each in its own stable colour, with a textual legend. A "Needs attention" filter narrows the list to inspectors with active alerts.

**Why this priority**: Date navigation and the all-routes overlay are important but secondary to the live single-inspector flow. Independently testable via URL params and toggles.

**Independent Test**: Change the date selector to yesterday and assert a new request with that `date` and that polling stops; toggle "Show all routes" and assert `includeGeometry=all` plus one `RouteLayer` per visible inspector and a "Routes" legend; toggle "Needs attention" and assert only alerting rows and their pins remain.

**Acceptance Scenarios**:

1. **Given** today is shown, **When** the Operator picks yesterday in the date selector, **Then** a request goes out with that `date`, polling stops, the "Today" button is disabled only when `date === data.today`, and the selector's maximum is always `data.today + 1` regardless of the selected date.
2. **Given** a deep link `?date=` beyond tomorrow, **When** the request returns 400 `LIVE_DAY_DATE_TOO_FAR`, **Then** the URL is replaced with `?date=<today>`, the page loads today, and a `role="status"` banner reads "That day isn't available yet. Showing today." (no error EmptyState).
3. **Given** more than 40 visible inspectors, **When** "Show all routes" is considered, **Then** the toggle is `aria-disabled="true"` with tooltip "Narrow the list (Needs attention) to show all routes — up to 40 at once", and `routes=all` from the URL is ignored until the list fits (≤ 40). *(client cap `LIVE_DAY_SHOW_ALL_MAX`)*
4. **Given** "Show all routes" is on with ≤ 40 visible inspectors, **When** it is enabled, **Then** the request uses `includeGeometry=all`, one `RouteLayer` draws per visible inspector with `geometryIncluded true` (dots for stops), and a legend "Routes" lists each name with its colour dot; disabling removes them.
5. **Given** the "Needs attention" toggle, **When** it is on, **Then** only rows with alerts and their pins remain; the toggle has `aria-pressed` and a "(n)" counter; with zero results it shows "Nobody needs attention right now." (today/tomorrow) or "Nobody needed attention on {EEE d MMM}." (past day) and a "Show everyone" action.
6. **Given** the browser clock is wrong, **When** `isLive` is evaluated, **Then** it uses `date >= data.today` (server `today`), so tomorrow still polls and a past server-day never polls.

---

### User Story 4 - The screen is resilient, accessible and works on a phone (Priority: P4)

Polling failures, empty states and errors are surfaced without stealing focus; the ETA-accuracy footer reports route reliability; the screen is fully keyboard-operable with its a11y invariants asserted (no axe engine; see Premises); on a phone the panel collapses so the map is usable.

**Why this priority**: These qualities make the screen production-ready (WCAG AA, mobile, operational resilience). Independently testable per concern.

**Independent Test**: Simulate a polling error after a success and assert a polite `role="status"` banner with a timestamp and "Retry" while the list stays; assert the a11y invariants (roles/aria/keyboard) on list/detail/legend; render at 375 px and assert the collapsible "Map / List" panel and no horizontal scroll; assert the ETA footer texts for each `status`.

**Acceptance Scenarios**:

1. **Given** a first-load 500, **When** the page renders, **Then** an error EmptyState "We couldn't load the Live Day." with a "Try again" button (refetch) shows.
2. **Given** a successful first load then a polling 500, **When** the poll fails, **Then** the list stays and a polite `role="status"` banner "Couldn't refresh. Showing data from {HH:mm}." with "Retry" appears and clears on the next success; it never steals focus.
3. **Given** the ETA-accuracy response, **When** the footer renders, **Then** `OK` → "Route ETA accuracy (30 days): 6.2 min average error · 214 stops"; `ABOVE_THRESHOLD` → same text + "Above the 10 min target" (warning tone); `INSUFFICIENT_DATA` → "Route ETA accuracy: not enough data yet (12 of 30 stops)"; `sampleSize 0` → "Route ETA accuracy: no data yet"; request error → "Route ETA accuracy unavailable".
4. **Given** any tested view, **When** the a11y-invariant assertions run, **Then** the required structure is present: progress bars expose `role="progressbar"`, `aria-valuemin 0`, `aria-valuemax total`, `aria-valuenow done`, `aria-label "{name} progress"`; toggles use `aria-pressed`; the current stop uses `aria-current="step"`; colour is never the sole signal. *(No axe engine — the web workspace has none; see Premises.)*
5. **Given** a 375 px viewport, **When** the page renders, **Then** the panel is anchored at the bottom, full width with a 16 px gutter, `max-h-[50dvh]` with internal scroll, and a "Map / List" button (`aria-expanded`) collapses it to its header; there is no horizontal page scroll and touch targets are ≥ 44 px; the `/map` screen inherits the same mobile mode and keeps its saved desktop width.
6. **Given** route lines that share a similar colour, **When** the Operator hovers a line, **Then** a light Mapbox popup (no focus, no close button) shows the inspector's name; the legend remains the textual alternative.

### Edge Cases

- **Selected inspector disappears on a poll** (lost all stops and has no `CANT_DO`): return to the list with a polite `role="status"` "{name} no longer has work on this day."
- **Date changed with an inspector selected**: keep the selection if the inspector exists on the new date; otherwise clear it.
- **Two inspectors at the same base point**: `computeMarkerOffsets` separates the pins (no clustering).
- **Stop without coordinates**: no stop pin; the stop row shows "Location not found for this address"; excluded from `fitBounds`.
- **Past day**: no polling; subtitle without "updates every 30 s"; routes render as straight dashed fallback with "Approximate route"; remaining stop times read "Planned HH:mm"; `NOT_STARTED` reads "not started that day".
- **Tomorrow before 19:30** (plan not generated yet, `planStatus 'NONE'`): chip "Route not generated yet — plans publish at 19:30" instead of "No route plan"; unconfirmed ROUTINE appointments are already filtered out server-side (T-1).
- **Tomorrow with `planStatus 'DRAFT'`**: chip "Not published yet"; everything `NOT_STARTED`.
- **List changing under the cursor**: the row order is frozen while a pointer is over the list or focus is inside it (L-F05-08); a newly-alerting inspector rises only after the Operator leaves the list (or on filter/date change, or unmount).
- **Alert handled by Operations** (e.g. a `CANT_DO` service re-offered): the alert simply disappears on the next poll; there is no acknowledge/dismiss control (L-F05-01).
- **Browser clock wrong**: "Updated N s ago" uses `dataUpdatedAt` (relative only); all "today" logic uses `data.today`/`data.isToday` from the server.
- **Map recreated / `style.load` again**: `RouteLayer` re-adds its source and layers idempotently.
- **Mapbox token missing**: `MapContainer` shows its own notice; the list still works.
- **Link to an appointment and back**: `?date` + `?inspector` in the URL restore the screen (the appointment detail's `BackButton` uses `useGoBack`).
- **Route infeasible** (`routeFeasible false`): a "Route infeasible" badge with a tooltip listing the violating stops — it is an **indicator**, not an alert; it does not count toward "Needs attention" and does not change the severity order.

## Requirements *(mandatory)*

### Functional Requirements

**Routing, access & menu**

- **FR-001**: The web MUST register a lazy route `/live-day` guarded by `AuthGuard roles={[UserRole.AM, UserRole.OP]}` (same pattern/comment as `/inspector-workload`); the server also enforces AM/OP. CL_ADMIN/CL_USER/INSP are denied.
- **FR-002**: The sidebar Dashboard group MUST gain a child `{ icon: 'mdi-map-clock-outline', label: 'Live Day', to: '/live-day', roles: [AM, OP] }` positioned **immediately after "Overview"** (canonical X01 order: Overview · Live Day · Inspector notices · Analytics · Workload). The group is active on `/live-day`. Menu tests assert by label and relative position, never by absolute index or count, and the roles test uses the real `SidebarSubmenu`/`SidebarItem` (no mocks) with `MemoryRouter`.

**Data, polling & URL**

- **FR-003**: `useLiveDay({ date, geometryMode, selectedId })` MUST call `GET /v1/dashboard/live-day` with `useQuery`, `queryKey ['live-day', date, geometryMode, selectedId]`, `refetchInterval: isLive ? 30_000 : false`, `refetchIntervalInBackground: false`, `placeholderData: keepPreviousData`, where `isLive = date >= data.today` (server today; before the first response, `isLive = true`).
- **FR-004**: `geometryMode` MUST follow D18: `all` when "Show all routes" is on; else `selected` (with `inspectorId`) when an inspector is selected; else `none`. The request sends `includeGeometry` and `inspectorId` only in those cases, so the 30 s poll never carries geometry the screen does not draw. Changing the selection from J to T issues a new `selected&inspectorId=T` request while `keepPreviousData` keeps J's list/route until it resolves (no flicker).
- **FR-005**: The URL MUST support `/live-day?date=YYYY-MM-DD&inspector=<uuid>&attention=1&routes=all`, all optional; no `date` = server today. Changes use `setSearchParams(..., { replace: true })`. An `inspector` that does not exist on the day is ignored silently. An invalid `date` (e.g. `2026-13-40`) → the first request omits `date`. A `date` beyond tomorrow → 400 `LIVE_DAY_DATE_TOO_FAR` → set `date = data.today` with `replace` and show the "That day isn't available yet. Showing today." banner. `routes=all` with more than 40 visible is ignored until the list fits.
- **FR-006**: `useEtaAccuracy` MUST call `GET /v1/day-plans/eta-accuracy` with `days 30`, `staleTime 10 min`, no `refetchInterval`.
- **FR-007**: Reads MUST NOT call any Mapbox API (Directions/Matrix/Geocoding) from the browser; route geometry comes pre-built from the response. *(verified in DevTools during QA)*

**Derived presentation (pure selectors in `lib/liveDayView.ts`)**

- **FR-008**: `filterInspectors(list, { needsAttention })` MUST return only `needsAttention` inspectors when the flag is on.
- **FR-009**: `routesToDraw(list, { showAll, selectedId })` MUST return only the selected inspector when `showAll` is off; all visible inspectors when `showAll` is on (respecting the filter); and when both, all with the selected one at `emphasis 'selected'` and the rest `'muted'`.
- **FR-010**: `formatDelay` MUST render `22 → "+22 min"`, `0 → "On time"`, `-5 → "On time"`, `null → "—"`.
- **FR-011**: `stopTimeLabel(stop)` MUST render, all in `stop.timezone`: DONE with start+finish → "Done 09:02–09:41"; DONE without execution → "Done (no check-in)"; CURRENT with `startedAt` → "In progress since 10:17"; CURRENT without `startedAt` → "Next · ETA 10:40"; OPEN → "Started 09:00 · not checked out"; REMAINING → "ETA 11:15"; REMAINING out-of-plan → "Window 13:00–15:00"; REMAINING on a past day (`date < today`) → "Planned 11:15".
- **FR-012**: `sortInspectors(list)` MUST order by `(rank of the most-severe alert via LIVE_DAY_ALERT_TYPE_ORDER, inspectorName localeCompare 'en-AU')`; no alert = rank 7 (last); an inspector with DELAY + CANT_DO uses the CANT_DO rank.
- **FR-013**: `canShowAllRoutes(visibleCount)` MUST be `true` for ≤ `LIVE_DAY_SHOW_ALL_MAX` (40) and `false` above it.
- **FR-014**: `useFrozenOrder` MUST hold the last computed order while the list is being interacted with (pointer over the list or focus inside it) and release it on the first interaction-free render, or when the filter/date changes, or on unmount.

**List, state & alerts (01.A5 display)**

- **FR-015**: Each inspector row MUST show: the inspector's colour dot (`hex`, `aria-hidden`), name, a state badge (icon + text from `LIVE_DAY_STATE_LABELS`), a progress bar + "1 of 3 done", delay text, alert icons with an `sr-only` summary (e.g. "2 alerts: Can't do this job, Running late"), route chips, a "Route infeasible" badge when applicable, or "Location unknown" when `lastKnown.source === 'NONE'`.
- **FR-016**: Each alert returned by the API MUST render with its specified text and count toward "Needs attention"; turning on the "Needs attention" filter hides inspectors without an alert. The display MUST handle all **seven** alert types the API can send: DELAY, NOT_STARTED, LATE_NOTICE, CANT_DO, GEOFENCE, OUT_OF_WINDOW, COMPLETION_REMINDER. *(01.A5; the original criterion enumerates five types — delay, not started, late notice, can't do, geofence — and F05 adds the completion reminder and out-of-window per D20)*
- **FR-017**: Alert copy MUST be (per `LiveDayInspectorDetail`): `DELAY` "Running 22 min late (limit 20 min)", override → "(limit 15 min, custom)"; `NOT_STARTED` "{code} not started — due at 10:00 (240 min ago)", past day → "{code} not started that day (due at 10:00)"; `OUT_OF_WINDOW` "Checked in outside the window for {code} (25 min off, tolerance 15 min)", `thresholdMinutes null` → "...({n} min off)"; `LATE_NOTICE` "Said they'd arrive around 09:20 (20 min late): {reasonLabel} · {code}" using the server `estimatedArrivalAt` in the stop timezone (never `predictedStartAt + minutes`); `CANT_DO` "Couldn't do {code}: {reasonLabel}" + the note in italics; `GEOFENCE` "Checked in 900 m from the property (limit 300 m) · {code}" / "Checked out …", `radiusMeters null` → "Checked in 900 m from the property · {code}"; `COMPLETION_REMINDER` "Completion reminder sent for {code} at 11:31".
- **FR-018**: The client MUST NOT provide any acknowledge/dismiss of alerts (not even per session); the "Needs attention" count and the alerts reflect exactly what the server returns, and alerts disappear only by the server's exit rules.
- **FR-019**: A `routeFeasible false` inspector MUST show a "Route infeasible" badge (icon + text, warning tone) with an accessible tooltip (hover and focus) "Some stops can't be reached within their window:" and one line per `routeViolations` item "{appointmentCode} · ~{lateMinutes} min after its window". This indicator MUST NOT count in "Needs attention" nor change the severity order.

**Date header, summary & chips**

- **FR-020**: The header MUST show `<h1>` "Live Day" + a help tooltip ("Positions come from each inspector's last check-in or check-out. Properfy doesn't track inspectors between stops, so 'In transit' is an estimate."), the subtitle ("Last known location · updates every 30 s" live; "Last known location" on past days), and "Updated {just now | N s ago | N min ago}" (from `dataUpdatedAt`, refreshed every 15 s, no `aria-live`) with a spinning refresh icon while fetching.
- **FR-021**: The date control MUST be a `DateInput` labelled "Day" with `max = addCivilDays(data.today, 1)` (no min) plus a "Today" button disabled when `date === data.today`.
- **FR-022**: The summary MUST show four counters (not filters) "Not started / At a property / In transit / Done for the day" plus "{stopsDone} of {stopsTotal} stops done".
- **FR-023**: Route chips per row MUST reflect `planStatus`/flags: `routeApproximate true` → "Approximate route" (tooltip "Straight lines between stops — the planned road route isn't available."); `routeOutOfDate true` → "Route may be out of date"; `DRAFT` → "Not published yet"; `NONE` with `date ≤ today` → "No route plan"; `NONE` with `date > today` → "Route not generated yet — plans publish at 19:30".

**Map, pins & routes**

- **FR-024**: A new web component `components/map/RouteLayer.tsx` MUST draw a `dayPlanGeometrySchema` FeatureCollection: a geojson source `live-route-<inspectorId>` and two line layers — `<id>-solid` filtered `['!=', ['get','approximate'], true]` and `<id>-dashed` filtered `['==', ['get','approximate'], true]` with `line-dasharray [1.5, 1.5]` — `line-cap/join round`, inserted `beforeId` the first `symbol` layer. It MUST use the comma-form HSL (`inspectorRouteColor(id).mapbox`) for paint; a space-form `hsl(a b c)` must be rejected (never reach paint). `emphasis`: `line-width` 3 (normal/muted) or 5 (selected); `line-opacity` 0.9 (normal/selected) or 0.35 (muted). Optional `stops` with `variant 'dots'` → a circle source/layer (`radius 4`, white stroke). It MUST be idempotent (`getSource` before `addSource`, `setData` on update, cleanup on unmount, re-add when the map is recreated), MUST support `onClick` (both line layers, cursor pointer on `mouseenter`), and MUST show a light hover popup with `label` (no focus, no close button). `geometry null` → `setData(EMPTY)`. It MUST never call Mapbox Directions.
- **FR-025**: `MapMarker` MUST gain optional props `headColor`, `outlineColor`, `innerText`, `innerIcon` without changing existing behaviour. `computeMarkerOffsets` MUST move to `components/map/marker-offsets.ts` (content unchanged) with `AppointmentMapPage` only switching its import; `components/map/index.ts` MUST export `RouteLayer` and `computeMarkerOffsets`.
- **FR-026**: An inspector pin MUST encode **state** in the head colour + MDI icon (never colour alone): NOT_STARTED `mdi-clock-outline` `#4B5563`; AT_PROPERTY `mdi-home-account` info; IN_TRANSIT `mdi-car` warning; DONE_FOR_DAY `mdi-check-all` success. `needsAttention` adds a red badge on the head (`aria-hidden`); a pin whose route is drawn gets `outlineColor` = the inspector's colour. The pin `aria-label` MUST be like "Jane Doe — At a property, 1 of 3 done, 22 min late. Last known location: check-in at 10:17." `lastKnown.source === 'NONE'` → no pin.
- **FR-027**: Selected-inspector stop pins (24 px circle `MapMarker`) MUST render per progress: DONE → `innerIcon 'mdi-check-bold'`, inspector colour fill, white border; CURRENT → `innerText` = sequence, inspector colour, `active` ring; OPEN → `innerText` = sequence, inspector colour at 60 % via `color-mix`, white border; REMAINING → `innerText` = sequence, white fill, inspector-colour border and text; out-of-plan → `innerText '•'`, white fill, dashed inspector-colour border. Their `aria-label` is like "Stop 2, INS-0043, 14 Crown St — in progress since 10:17"; clicking scrolls the list to the row and focuses it.
- **FR-028**: The camera MUST only move on first load per date (`fitBounds` of all inspector pins, or `flyTo` zoom 13 for one, or default view for none) and on selection (`fitBounds` of origin + coordinate-bearing stops + inspector pin). Polling MUST never move the camera. `prefers-reduced-motion: reduce` → `duration: 0`.

**Layout, resilience & a11y**

- **FR-029**: `MapScreenLayout` MUST gain `storageKey?: string` (default `'appointments-map.filter-panel.width'`, so `/map` is unchanged) and a collapsible mobile mode below `md` (768 px): panel anchored at the bottom, full width with a 16 px gutter, `max-h-[50dvh]` with internal scroll, and a "Map / List" button (`aria-expanded`) collapsing to the header. `/map` inherits the mobile mode with no other change; Live Day uses `storageKey 'live-day.panel.width'`.
- **FR-030**: Data states MUST be: first-load skeleton (6 rows, `aria-busy`) with the map's own "Loading map..."; empty → EmptyState "No inspectors have work on {EEE d MMM}."; "Needs attention" + 0 → "Nobody needs attention right now." / "Nobody needed attention on {EEE d MMM}." + "Show everyone"; initial error → "We couldn't load the Live Day." + "Try again" (except `LIVE_DAY_DATE_TOO_FAR`, handled as the today redirect); polling error → polite `role="status"` "Couldn't refresh. Showing data from {HH:mm}." + "Retry", cleared on next success.
- **FR-031**: The `RouteEtaAccuracyFooter` MUST render the five states of FR (US4 scenario 3) plus a loading text "Route ETA accuracy…".
- **FR-032**: The screen MUST meet WCAG 2.1 AA: full keyboard operation (Enter/Space selects a row, Escape returns to the list, focus to `<h2>` on enter and back to the row on exit; tab order header → date → Today → toggles → list → footer, then map pins), colour never used alone (state via icon+text, inspector via name beside the dot, delay via text, routes via hover name + legend), `aria-pressed` toggles, `aria-current="step"` current stop, visible counters. These invariants MUST be asserted explicitly in the list/detail/legend tests (role/aria/keyboard); the web workspace has no axe engine (see Premises), so the axe runner is not used.
- **FR-033**: The legend MUST always show the 4 state items (icon + text); a "Routes" section with inspector names appears only with "Show all routes"; above 12 routes (up to the 40 cap) it scrolls (`max-h` ~8 rows) with `aria-label="Route colours"`.

**Docs**

- **FR-034**: This PR MUST update `apps/web/CLAUDE.md` (X00 rule) to document: `components/map/RouteLayer` (first web line layer; comma-HSL paint; solid/dashed by `approximate`), the shared per-inspector palette, the 30 s visible-tab polling, "Live Day" in the Dashboard group, `MapScreenLayout` `storageKey` + collapsible mobile mode (L-F05-04), and "today always from the server" (`data.today`, L-F05-05).

### Key Entities *(consumed; no new data)*

- **LiveDayResponse**: `date`, `today`, `timezone`, `isToday`, `generatedAt`, `thresholdsDefault`, `summary` (inspectors/notStarted/atProperty/inTransit/doneForDay/needsAttention/stopsDone/stopsTotal), `inspectors[]` (server-sorted by name; the web re-sorts by severity).
- **LiveDayInspector**: `inspectorId`, `inspectorName`, `state`, `lastKnown {source,lat,lng,at,appointmentId,label}`, `progress {done,inProgress,remaining,total}`, `delayMinutes`, `thresholds {delayMinutes,delaySource,notStartedMinutes,notStartedSource}`, `alerts[]`, `needsAttention`, `dayPlanId`, `planStatus (DRAFT|PUBLISHED|STALE|NONE)`, `planVersion`, `routeOutOfDate`, `routeApproximate`, `routeFeasible`, `routeViolations[]`, `origin|null`, `geometryIncluded`, `geometry|null`, `stops[]`.
- **LiveDayAlert**: `type`, `occurredAt`, `appointmentId|null`, `appointmentCode|null`, `minutes|null`, `estimatedArrivalAt|null`, `thresholdMinutes|null`, `thresholdSource|null`, `reason|null`, `reasonLabel|null`, `note|null`, `phase|null`, `distanceMeters|null`, `radiusMeters|null`.
- **LiveDayStop**: `appointmentId`, `appointmentCode`, `sequence|null`, `inPlan`, `progress`, `agencyName`, `propertyAddress`, `suburb`, `lat|null`, `lng|null`, `missingCoordinates`, `windowStart`/`windowEnd` ("HH:mm" agency wall time), `timezone`, `startedAt|null`, `finishedAt|null`, `predictedStartAt|null`, `publishedStartAt|null`, `delayMinutes|null`.
- **RouteEtaAccuracy**: `meanAbsoluteErrorMinutes|null`, `sampleSize`, `excludedOutliers`, `thresholdMinutes` (10), `minSampleSize` (30), `status (INSUFFICIENT_DATA|OK|ABOVE_THRESHOLD)`.
- **InspectorRouteColor**: `{ mapbox, hex, index }` from `inspectorRouteColor(inspectorId)`.

## Success Criteria *(mandatory)*

### Acceptance criteria (contract codes, verbatim)

- **01.A4**: After a check-in the state becomes "at the property"; after a check-out it becomes "in transit" or "day finished". With the real backend, a check-in of a stop in the PWA (or `POST …/start`) makes the pin and the row show "At a property" within 30 s; a check-out with a remaining stop shows "In transit"; the last check-out shows "Done for the day". Proven by manual QA (smoke) + `LiveDayPage.test.tsx` with a sequence of mocked responses.
- **01.A5**: Each progress alert type fires according to its configured threshold. The display side MUST render every alert the API sends — the five enumerated types (delay, not started, late notice, can't do, geofence) **plus** the completion reminder and out-of-window added by F05 (seven total, D20) — each with its specified text, and each counts in "Needs attention"; turning on the filter hides inspectors without an alert. Proven by per-type assertions in `LiveDayInspectorDetail.test.tsx` and the filter test in `LiveDayPage.test.tsx`.

### Measurable Outcomes

- **SC-001**: Live Day appears in the sidebar for AM/OP only, between Overview and Inspector notices; `/live-day` is reachable by AM/OP and denied to CL/INSP.
- **SC-002**: With the tab visible on today or tomorrow, the list refreshes every 30 s; on past days and with the tab hidden there is no polling; no request to `api.mapbox.com/directions` is ever made (DevTools).
- **SC-003**: A route is drawn for the selected inspector (and for all visible inspectors with "Show all routes", capped at 40), each in its stable inspector colour, consistent across the dot, line and legend; without geometry the lines render straight and dashed with "Approximate route".
- **SC-004**: Every alert type renders with its specified copy and counts in "Needs attention"; "Route infeasible" shows as an indicator that does not count in "Needs attention".
- **SC-005**: The required a11y invariants (progressbar roles, `aria-pressed` toggles, `aria-current="step"`, keyboard order, colour-not-alone) are asserted across list, detail and legend; the screen is fully keyboard-operable.
- **SC-006**: At 375 px the panel collapses via "Map / List", there is no horizontal scroll, and touch targets are ≥ 44 px; `/map` keeps its saved desktop width and gains the same mobile mode.
- **SC-007**: "Today", the selector max and polling all follow `data.today`; a deep link with a date beyond tomorrow lands on today with the "That day isn't available yet." banner.
- **SC-008**: The PR changes no backend, schema, OpenAPI or `api-types` file; `git diff --stat origin/develop...` is under 150 files.

## Assumptions / Premises

- **Merged contract wins over the task-file snapshot.** Where the TASK-F05-2 copy differs from the merged TASK-F05-1 shared contract, the merged code is authoritative. In particular the state label for `AT_PROPERTY` is **"At a property"** (`LIVE_DAY_STATE_LABELS`, merged), not the task file's "At property"; the web renders from the shared labels and asserts those strings.
- **`isLive = date >= data.today`.** The response exposes `today` and `isToday`; since tomorrow must also poll, "live" is computed as `date >= today`, not `isToday`.
- **Geometry is always straight-line fallback → `routeApproximate` is always `true`.** F04 shipped as "Plan B" (no persisted Mapbox routing): the Live Day read model serves in-memory straight-line geometry, so every inspector carries `routeApproximate true` and the UI always shows the "Approximate route" chip and draws the dashed layer. `RouteLayer` still implements both solid and dashed layers keyed on each feature's `properties.approximate`, so it is correct if real geometry is ever served.
- **Menu placement.** "Inspector notices" (F02-2) is already merged in the Dashboard submenu; "Live Day" is inserted between "Overview" and "Inspector notices", matching the canonical X01 order documented in `Sidebar.tsx`.
- **Multi-tenant exception (D14), inherited from F05-1.** The consumed `live-day`/`eta-accuracy` reads are AM/OP cross-tenant with no `tenant_id`; the page is AM/OP-gated and the client applies no tenant scoping. This web task adds no entity, so it carries the exception registered by TASK-F05-1 rather than introducing a new one.
- **Branch & target.** Work is on `060-f05-2-live-day-screen` off `origin/develop`; the PR targets `develop`. (This supersedes the task file's older `feat/f05-live-day-web` branch-name suggestion.)
- **Pending product decisions.** No open Q2/Q4/Q6/Q12 decision affects this web task; all decisions it depends on (D1–D21, L-F05-*, L-X01-*) are already resolved in the task file and assumed as written.
- Dev environment has the F05-1 shared build available (`@properfy/shared` and `@properfy/frontend-standards` built to `dist/`), and `mapbox-gl` is already in the map chunk.
- **No axe engine (repo precedent).** The web workspace has no axe tooling and prior analogous web features shipped without it, so the a11y acceptance (FR-032, SC-005) is met by asserting concrete ARIA/keyboard invariants in the tests, not by running the axe engine; this task adds no test dependency.

## Dependencies

- **TASK-F05-1 merged** (`origin/develop` @ `93179912`): the three endpoints (with `today`), the shared Live Day schemas/enums/labels, the per-inspector palette, the caps, and the regenerated `api-types`.
- **TASK-X01-1 merged**: the Dashboard sidebar group with `submenu`, `NAV_ITEMS` and `filterNavItems` exported, and the no-mocks `Sidebar.roles.test.tsx`.
- **F04** `GET /v1/day-plans/eta-accuracy` and `dayPlanGeometrySchema`.

## Out of scope

- The "Locked time" tab and the alert-threshold screens (TASK-F05-3).
- Recomputing plans, downloading sheets, editing/reordering stops.
- Search by name, filters by agency or state (only "Needs attention").
- Any change to `DashboardPage`, `AnalyticsPage`, `InspectorWorkloadPage`, `AppointmentMapPage` (beyond switching the `computeMarkerOffsets` import), and `dashboard.routes.ts` on the backend.
- Sound/push notification to Operations; alert acknowledge/dismiss (L-F05-01); clustering of inspector pins (L-F05-06).
