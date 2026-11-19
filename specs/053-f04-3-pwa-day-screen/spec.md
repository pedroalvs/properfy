# Feature Specification: F04-3 · PWA Day Screen & Route navigation base

**Feature Branch**: `053-f04-3-pwa-day-screen`
**Created**: 2026-11-02
**Status**: Draft
**Input**: User description: "F04-3 PWA day screen navigation base" — Phase 2, track C (PWA), first PR of the F04 Part B chain. Source: `fase2-etapa1/tarefas/F04-tarefas.md` §TASK-F04-3 + "Contratos exportados para a Parte B".

## Context & Constraints *(non-negotiable)*

- **PWA only.** Consumes the already-merged F04-2 contract (PR #1331) exactly as published. No backend/schema/`api-types.ts` change **except** the one `targetPath: '/today'` wiring (see FR-030) and the shared helpers that are part of this task's "navigation" item (allowlist `/today`, `formatInstantTime`). No new route schema, so no `api-types.ts` regeneration is expected; if the committed contract is stale, regenerate with `pnpm generate:api` rather than hand-editing.
- **Dependencies merged before this task:** TASK-F04-2 (endpoints, `dayPlanResponseSchema`, optional `targetPath` on notices), TASK-F01-3 (`BaseAddressBanner`, structured `BaseAddress` fields inline, heartbeat), TASK-F02-3 (announcements inbox, unread badge, service worker `injectManifest`, allowlist), TASK-F03-3 (`AppointmentCard` action bar, `useExecutionActions`, field-event sheets).
- **Merge order of Part B:** F04-3 (this) → F04-4 → F04-3b.
- **Shared-file discipline:** `inspector-notices.ts` — only **append** `/today` to `INSPECTOR_NOTICE_TARGET_PATTERNS`; never resolve `api-types.ts` conflicts by hand (regenerate); one migration per PR (N/A here — no schema change); the `INSPECTOR_NOTICE_TARGET_PATTERNS` allowlist change and the route-notice `targetPath` change ship in this same PR.
- **Timezone law:** civil dates (`:date` = `YYYY-MM-DD`) are computed with `todayInTzDateString(effectiveTz)`, never the device timezone; instants (`eta`, `serviceStartAt`, `finishEta`) are UTC ISO strings formatted in `stop.timezone` (per-stop) or `plan.timezone` (header/greeting) through shared helpers. Timezone-dependent tests pin `TZ=America/Los_Angeles`.
- **Platform scope exception:** `DayPlan` is a cross-tenant (per-inspector) platform-scoped entity with no `tenant_id`; the PWA reads only its own plan (INSP, own plan, by civil date), through the inspector endpoints. The Mapbox token never reaches the PWA — geometry and the raw routing matrix (`routingInput`) arrive pre-computed in the response.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Today screen as the inspector's home (Priority: P1)

After login, the inspector lands on a new **Today** screen (`/today`) that shows the day's route at a glance: a greeting, a progress line ("X of N done · finish ~hh:mm"), the **Next inspection** card (address, window, ETA, distance, **Navigate** + **Check in/Check out**), a **Coming up** list, an unread-announcements card, and a **tomorrow's route** card. The bottom bar becomes **Today / Schedule / Offers / More**, with **More** opening the existing `/profile` hub (URLs unchanged, no redirect).

**Why this priority**: This is the core deliverable (contract 00.1/00.5). The Today screen is the new app home; without it the inspector has no view of the published route and the navigation bar is inconsistent with the v3 design. It is the foundation the rest of Part B (route map, reorder, tour) builds on.

**Independent Test**: With the F04-2 endpoints available (local backend + Mapbox stub or staging), log in as an inspector with a published plan and confirm the landing route is `/today`, the bar shows Today/Schedule/Offers/More with Today active, and the Today screen renders greeting, progress, Next inspection, Coming up and the tomorrow card from the plan payload.

**Acceptance Scenarios**:

1. **Given** an inspector with no saved redirect, **When** they log in, **Then** they land on `/today` and the bottom bar shows Today/Schedule/Offers/More with Today marked `aria-current="page"` (contract **00.1/00.5**).
2. **Given** a published plan with 3 stops and 0 done, **When** the Today screen loads at 07:00 Sydney, **Then** it shows "Good morning, {firstName}", "{Weekday, d MMM} · Online", "0 of 3 done · finish ~{finishEta}", a "NEXT INSPECTION" card with ETA/address/window/distance + Navigate + Check in, a "COMING UP" list of up to 3 following stops, and "View and reorder all 3 stops" → `/today/route` (contract **01.A1** display, list part).
3. **Given** the Next inspection card, **When** the inspector taps **Check in**, **Then** `useExecutionActions().checkIn` runs for that stop and the screen does not navigate; **When** they tap the address body, **Then** the app navigates to `/schedule/{appointmentId}`.
4. **Given** all stops are DONE, **When** the Today screen loads, **Then** it shows "All done for today" and "3 of 3 done" with no Next card; **Given** `stops: []`, **Then** it shows "No inspections today" + "Browse offers" → `/marketplace`.
5. **Given** the inspector opens the **More** tab, **When** it navigates, **Then** it opens the existing `/profile` hub (Earnings, Announcements, Availability, Documents, My account, and a new "App settings" row), with no URL renamed and no redirect; More stays active on `/profile/*` and `/earnings/*`.

---

### User Story 2 - Route list with per-day base and sheet download (Priority: P2)

The inspector opens the **Route** screen (`/today/route[/:date]`) in list mode: a summary (driving, finish, waiting, distance), a "Starting from: {base} ✎" row that lets them set a **base for that day only**, the ordered stops with legs between them ("6 min drive · 1.0 km · wait 25 min for window"), and a **Download** menu for the route sheet (PDF/XLSX).

**Why this priority**: The route list is the detailed view behind "View and reorder all N stops" and the home of the per-day base (contract **Base do dia**) and the sheet (contract **01.A6**, delivered by the backend). It depends on Story 1's data layer but is a distinct, independently testable screen. The map and reorder controls are explicitly out of scope (TASK-F04-4).

**Independent Test**: Navigate to `/today/route` with a published plan and confirm the summary, ordered stop list with legs, the OriginRow, and a working Download menu (PDF + XLSX); change the base for the day and confirm the ETAs change and "(this day only)" appears, then "Use my base address" reverts.

**Acceptance Scenarios**:

1. **Given** `/today/route`, **When** the Route screen loads, **Then** the TopBar reads "Today's route" with back → `/today`, the summary shows "{drive} driving · Finish {finishEta}" (+ waiting when `totals.waitS > 0`, + distance), and the stops render in `sequence` order with `RouteLegRow` legs between them and "From start: …" above the first (contract **01.A1** display, list part).
2. **Given** `origin.source 'BASE'`, **When** the inspector taps the OriginRow pencil and submits a structured address, **Then** `PUT …/origin` runs, the plan is replaced by the response, the row shows "Starting from: {label} (this day only)", and "Use my base address" (`DELETE …/origin`) reverts it (contract **Base do dia**).
3. **Given** `origin.source 'LAST_STOP'` (today, after the first check-in), **When** the OriginRow renders, **Then** it shows "Continuing from: {label}" as **text only** — no pencil, no "Use my base address", no element named "Change starting point for this day" (L-F04-07); **and** a sheet left open before check-in and submitted after → 422 `DAY_PLAN_ALREADY_STARTED` message in `role="alert"`, the sheet closes after 2 s and the plan is invalidated.
4. **Given** `originWarning 'NO_BASE'`, **When** the Route/Today screen renders, **Then** it shows "No base address: route has no starting point" + "Add base address" → `/profile/account#base-address`; `'BASE_NOT_LOCATED'` → "We couldn't locate your base address — please check it".
5. **Given** the Download menu, **When** the inspector picks "PDF" or "Spreadsheet (XLSX)", **Then** `GET …/sheet?format=…` downloads via blob with the `Content-Disposition` filename (fallback `route-{date}.{ext}`); 404 → "This route isn't ready yet."; offline → "You're offline. Connect to download the route sheet." (contract **01.A6** consumption).
6. **Given** a date in the path, **When** it is `/today/route/2026-13-40` (invalid), **Then** the app replaces to `/today/route`; `/today/route/{tomorrow}` 404 `NOT_PUBLISHED` → "Your route for this day isn't ready yet. It's published at 7:30 pm the day before."; 404 `NOT_FOUND` → "There is no route for this day." + "Back to Today".

---

### User Story 3 - Stop card, call contact, and Navigate (Priority: P2)

Each stop (in the Next card and the Route list) shows address, window, ETA, key/meeting-location chips and a **Call {name} ({role})** link; tapping the card body opens the existing service detail. A **Navigate** button opens Apple Maps on iOS/iPadOS and Google Maps elsewhere, both on the stop card and in the existing service-detail address section.

**Why this priority**: These are the per-stop contract items (**01.5** stop card, **01.6** Navigate, L-F04-08 contact role). They are small, self-contained, and reused across Story 1 and Story 2, so they are specified as one slice that both stories depend on.

**Independent Test**: Render a `StopCard` for a stop with a primary contact and coordinates and confirm the `tel:` link text "Call Sam Lee (tenant)", the Navigate href (Apple on an iPhone UA, Google on Android), and that tapping the body routes to `/schedule/{id}` with no nested buttons in the DOM.

**Acceptance Scenarios**:

1. **Given** a stop with `primaryContact { name:'Sam Lee', phone:'+61412345678', role:'RENTAL_TENANT' }`, **When** the card renders, **Then** a `tel:+61412345678` link reads "Call Sam Lee (tenant)"; `role 'PROPERTY_MANAGER'` → "Call Sam Lee (property manager)"; `role 'OTHER'` → "Call Sam Lee"; no phone → no link (contract **01.5**, L-F04-08).
2. **Given** a stop with `keyRequired true` and `meetingLocation 'Front desk'`, **When** the card renders, **Then** chips "Key required" and "Meet at: Front desk" appear; `waitS > 0` → "Wait N min for window"; `lateS > 0` → "Arrives after window" (warning); `missingCoordinates true` → "Location not found for this address" (contract **01.5**).
3. **Given** the Navigate control, **When** the UA is an iPhone/iPad (or Macintosh with `maxTouchPoints > 1`), **Then** the href is `https://maps.apple.com/?daddr={lat},{lng}&dirflg=d`; otherwise `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=driving`; with no plottable point, the full address is URL-encoded in place of the coordinates (contract **01.6**).
4. **Given** the service-detail address section, **When** the inspector taps "Navigate to property", **Then** it uses the same `buildNavigationUrl` (Apple on iOS, Google elsewhere) with the "Navigate to property" text preserved (contract **01.6**).

---

### User Story 4 - Route notices open Today; offline plan; day rollover (Priority: P3)

Route notices (`ROUTE_PUBLISHED`/`ROUTE_CHANGED`) deep-link to `/today`; the plan is cached for offline viewing with the sensitive-data safeguards; and the civil "today" recomputes across the day boundary.

**Why this priority**: These are cross-cutting behaviors (F02 contract DB7, offline caching, day rollover) that make Stories 1–3 robust but are not the primary happy path. They are grouped last because they depend on all three earlier stories being in place.

**Independent Test**: Verify the shared allowlist accepts `/today` (exact static), the push handler opens `/today` for a route notice, the SW runtime-caching caches only `GET /v1/inspector/day-plans/{date}` in `api-day-plan-cache`, logout clears that cache, and `useCivilToday` recomputes the date on `visibilitychange`.

**Acceptance Scenarios**:

1. **Given** the shared allowlist, **When** `isAllowedInspectorNoticeTargetPath('/today')` is checked, **Then** it returns `true`; `/today/` (trailing), `/Today`, `//today`, `/today#x`, `/today?x=1`, `/today/route/2026-11-05`, `/today/x` → `false` (F02 D24, exact static pattern).
2. **Given** `PublishDayPlansUseCase`/`RecalculateDayPlanUseCase`, **When** they publish `ROUTE_PUBLISHED`/`ROUTE_CHANGED`, **Then** `publishSystemInspectorNoticeUseCase.execute` receives `targetPath: '/today'`; a route push with `url '/today'` opens `/today?fromNotice={id}`; other announcement pushes still open `/profile/announcements/{id}` (contract **DB7**, Achado 8).
3. **Given** the service worker, **When** `GET /v1/inspector/day-plans/2026-11-05` is fetched, **Then** it matches a NetworkFirst `api-day-plan-cache` route (`maxEntries 3`, `maxAgeSeconds` 12 h, `networkTimeoutSeconds 10`, `statuses: [200]`); `…/sheet`, `PUT …/order`, `PUT/DELETE …/origin`, `POST …/recalculate`, and `GET /v1/day-plans/…` (AM/OP) do **not** match; the existing 5 routes are unchanged; `INSPECTOR_API_CACHES` contains `api-day-plan-cache` and logout deletes it.
4. **Given** the app is reopened offline with a cached plan, **When** the Today/Route screen loads, **Then** it shows the saved plan with "Offline · showing your last saved route"; with nothing cached, "You're offline. Connect to load today's route." + Retry.
5. **Given** the app is open across midnight, **When** `visibilitychange → visible` fires at 00:01 of the next civil day, **Then** `useCivilToday` recomputes the date and the GET for the new date runs on its own.

---

### Edge Cases

- **0 stops**: Today shows "No inspections today" (no "finish"); Route shows the summary with "0 stops" and the OriginRow; nothing to reorder.
- **1 stop**: Coming up empty; the link reads "View route" (not "…and reorder all N stops").
- **No base (`NO_BASE`)**: route starts at the first window; no "From start" leg; warning + link; the inspector may still set a per-day origin.
- **Stops in different timezones** (agencies outside Sydney): each stop's ETA and window in `stop.timezone`; header/greeting in `plan.timezone`.
- **Tomorrow published before 19:30 local (L-F04-02)**: server returns 200 for a published plan in any timezone → the tomorrow card shows "Tomorrow · N stops · first at {ETA}" and never the "ready at 7:30 pm" text.
- **"Can't do this job" mid-day (F03)**: success invalidates the plan; the GET recalculates (server STALE) and the stop disappears; if the server still returns STALE, "Updating your route…" + one refetch per version.
- **Check-in offline**: the F03 queue holds it; the cached plan keeps the stop "not executed" until sync; sync invalidates the plan.
- **STALE twice**: only one automatic refetch per version; then "Updating your route…" until next focus or pull-to-refresh.
- **Two stops at the same property (L-F04-13)**: a 0 s / 0 m leg renders as "Same address" in `RouteLegRow` (no "0 min drive · 0 m").
- **Rate limit (429) on the GET**: treated as an error with Retry; React Query does not retry 4xx.
- **Inspector switches account on the device**: `queryClient.clear()` + SW cache cleanup on logout cover the plan cache.
- **Past date**: read-only (no origin edit); the sheet download stays available (unless older than hosted window → server 422 `DAY_PLAN_SHEET_TOO_OLD`).
- **Wide layout (tablet)**: `TodayLayout` with `fillHeight`; each pane scrolls on its own; `hasSelection = useMatch('/today/route/*') !== null`; closing → `/today` with replace.
- **iOS safe area**: the sheet uses `pb-safe-b-6`; the Today screen scrolls within `<main pb-nav-clear>`; nothing sticky outside the `STICKY_HEADER` pattern; the bottom-bar clearance contract (`fixed bottom-0`, `pb-safe-b`, `min-h-touch`, `pt-[9px]`, `border-t`, `grid-cols-4`, `nav-clear`) stays intact.

## Requirements *(mandatory)*

### Functional Requirements

**Navigation & More (00.1/00.5)**

- **FR-001**: The app MUST land on `/today` after login when there is no saved redirect; the router index and `*` fallback MUST resolve to `/today`; `router.tsx` MUST export its `routes`.
- **FR-002**: The bottom bar MUST show exactly four items in order Today / Schedule / Offers / More with `data-testid` `nav-today`, `nav-schedule`, `nav-offers`, `nav-more` and no `nav-earnings`/`nav-profile`; destinations `/today`, `/schedule`, `/marketplace`, `/profile`.
- **FR-003**: Today MUST be active (`aria-current="page"`) on `/today/*`; More MUST be active on `/profile/*` and `/earnings/*` (resolved via `useMatch`).
- **FR-004**: The unread-announcements badge MUST move from the Profile tab to the More tab: values 1–9, "9+" above 9, `aria-hidden` visual badge, `aria-label="More, {n} unread announcements"` when `n > 0`; Today/Schedule/Offers never carry a badge; loading/error/0 → no badge and name "More".
- **FR-005**: The More tab MUST open the existing `/profile` hub with **no URL renamed and no redirect**; the only change to `ProfilePage` is a new "App settings" `MenuRow` → `/profile/settings` above "Log out".
- **FR-006**: The nav-clearance contract test MUST stay green unchanged (bar keeps `grid-cols-4` and all five clearance classes).

**Today screen (00.1/00.5, 01.A1 list part)**

- **FR-010**: The Today screen MUST render a header: `h1` greeting "Good {morning|afternoon|evening}, {firstName}" (thresholds < 12:00 / < 18:00 in `plan.timezone`, or effective tz while loading; `firstName` = first token of `user.name`); line 2 "{Weekday, d MMM} · {Online|Offline}" (+ " · {n} waiting to sync" when the F03 offline queue has items); a progress line "{done} of {total} done · finish ~{finishEta}" (omit "· finish ~…" when there is no `finishEta` or all done) with a "Route" link → `/today/route`; the F03 `FailedSyncBanner` below when present.
- **FR-011**: The Today screen MUST stack route warnings in order: `originWarning` (NO_BASE/BASE_NOT_LOCATED, warning, link to `/profile/account#base-address`), `approximate` ("Approximate route: travel times are estimates", info), `status 'STALE'` ("Updating your route…", `role="status"`).
- **FR-012**: The **Next inspection** card MUST be `StopCard variant="next"` with label "NEXT INSPECTION" (or "IN PROGRESS" when `executionStatus 'IN_PROGRESS'`), right-aligned "ETA {formatInstantTime(eta, stop.timezone)}", address + suburb, "Window {formatWallTimeRange(windowStart,windowEnd)} · {drive} · {distance}" (omit null parts; first stop with no origin → window only), the chips of FR-050, the call link of FR-051, a `NavigateButton`, and the `AppointmentActionBar` (Check in/Check out + "More actions" with Running late / Can't do this job). The "next" stop is the first `executed: false` (or `IN_PROGRESS`) stop, derived live.
- **FR-013**: The **Coming up** list MUST show up to 3 non-executed stops after the next, each a `StopCard variant="row"`, with a link "View and reorder all {total} stops" → `/today/route` when `total ≥ 2`, else "View route".
- **FR-014**: The **unread-notices** card MUST render only when `useUnreadNoticeCount > 0`: "{n} unread announcement(s)" + chevron → `/profile/announcements`.
- **FR-015**: The **tomorrow** card MUST: on 404 `NOT_PUBLISHED` show "Tomorrow's route will be ready at 7:30 pm" (fixed text, agency hour); on 200 with stops show "Tomorrow · {n} stops · first at {ETA}" + "View route" → `/today/route/{tomorrow}`; on 200 empty show "No inspections tomorrow"; on error/offline hide the card (L-F04-02: a published plan returns 200 in any timezone, so the "ready at 7:30 pm" text never appears after the push).
- **FR-016**: The Today screen MUST handle states: loading (skeleton, `aria-busy`), empty (`stops: []`), all-done, error-without-cache ("Couldn't load your route" + Retry), offline-with-cache (content + "Offline · showing your last saved route"), offline-without-cache ("You're offline. Connect to load today's route." + Retry); pull-to-refresh refetches today + tomorrow.

**Route screen (01.A1 list part, Base do dia, 01.A6 consumption)**

- **FR-020**: The Route screen MUST have a `TopBar` "Today's route" (today) or "Route · {EEE d MMM}" (other date) with `showBack backTo="/today" backHideOnWide`, a subheader "{Weekday, d MMM} · {n} stops[ · {d} min each]", a `RouteSummary` ("{drive} driving · Finish {finishEta}"; "{wait} waiting" only when `totals.waitS > 0`; "{distance}" when present; a "{k} stop(s) would arrive after their window" alert when `totals.lateS > 0`).
- **FR-021**: The Route screen MUST render a `role="list"` of stops in `sequence` order, each a `StopCard variant="row"` (number, address, "{suburb} · {window}", "ETA {time}" or "Done"/"In progress", violation note "Arrives after its window ({window})"), with a `RouteLegRow` between stops carrying the leg **to the next stop** ("6 min drive · 1.0 km · wait 25 min for window") and "From start: …" above the first; a 0 s/0 m leg renders "Same address" (L-F04-13).
- **FR-022**: The **OriginRow** MUST reflect `origin.source`: `BASE` → full-row "Starting from: {label}" + pencil, `aria-label="Starting from {label}. Change starting point for this day"`; `OVERRIDE` → "Starting from: {label} (this day only)" + "Use my base address" (`DELETE`); `NONE` → "No base address: route has no starting point" + "Add base address" link + "Set a starting point for this day"; `LAST_STOP` → "Continuing from: {label}" text only, icon `MapPin`, no pencil, no "Use my base address", `originOverride` not shown (L-F04-07); past date or `NOT_FOUND` → text only, no pencil.
- **FR-023**: The **OriginSheet** (`Sheet side="bottom"`, focus trap, Escape, scroll lock, `pb-safe-b-6`) MUST have title "Start this day from", subtitle "Only for {EEE d MMM}. Your base address stays the same.", `BaseAddressFields` (Street*, Number, Unit, Suburb*, State* select NSW/VIC/QLD/WA/SA/TAS/ACT/NT, Postcode* `inputMode="numeric"`, Country "AU" hidden), **no autocomplete** (F01 D11 / DB4), pre-filled from `originOverride.address` when present. Submit → `PUT …/origin` with `{ address }` (`city = suburb`, `country 'AU'`, no lat/lng); success closes, `setQueryData`, snackbar "Route updated. Starting from {label} for this day.", focus returns to the OriginRow; `DELETE` snackbar "Route updated. Starting from your base address."
- **FR-024**: The OriginSheet MUST show server error text in `role="alert"`: 422 `DAY_PLAN_ORIGIN_NOT_FOUND`, 503 `DAY_PLAN_ORIGIN_GEOCODER_UNAVAILABLE`, 422 `DAY_PLAN_DATE_IN_PAST` (close + invalidate), 422 `DAY_PLAN_ALREADY_STARTED` (show, close after 2 s, invalidate — L-F04-07), 404 `NOT_PUBLISHED` (close + invalidate); form data kept; offline → submit disabled + "You're offline. Connect to change your starting point."; a double click → one request.
- **FR-025**: The **RouteSheetMenu** MUST offer "PDF" and "Spreadsheet (XLSX)" downloading via `apiGetBlob` + `<a download>` with an object URL revoked after 30 s; the filename comes from `Content-Disposition` (fallback `route-{date}.{ext}`); 404 → "This route isn't ready yet."; offline → "You're offline. Connect to download the route sheet." The Route list has no Map tab and no reorder controls in this task (TASK-F04-4 adds them).
- **FR-026**: The Route screen MUST handle `NOT_PUBLISHED`, `NOT_FOUND`, error, offline, past-date (read-only origin), and invalid path (`/today/route` replace) states per the UI spec.

**Stop card, call, Navigate (01.5 / 01.6)**

- **FR-050**: `StopCard` (variants `next` and `row`) MUST render only existing `DayPlanStop` fields (no new field): address, window (`formatWallTimeRange` of `windowStart/End`), ETA in `stop.timezone`, key/meeting-location chips, wait/late/missing-coordinates chips; executed → `opacity-60` + "Done"; violation → left `warning` border; in-progress → `primary` border; structure `<article aria-labelledby>` with a `<Link>` body to `/schedule/{id}` and sibling actions (no button-in-button); accessible item name "Stop {n}, {address}, ETA {time}".
- **FR-051**: `CallContactLink` MUST render `tel:{E.164}` with text/accessible name "Call {name} ({role label})" using labels `RENTAL_TENANT`→"tenant", `RENTAL_TENANT_REPRESENTATIVE`→"tenant's representative", `HOUSEKEEPER`→"housekeeper", `PROPERTY_MANAGER`→"property manager", `BROKER`→"broker", `OTHER`→no parenthesis; no phone → not rendered (L-F04-08). The PWA does not reorder contacts — the server chooses the primary contact.
- **FR-052**: `buildNavigationUrl({lat,lng,address}, env)` MUST return Apple (`https://maps.apple.com/?daddr={lat},{lng}&dirflg=d`) when the UA matches `/iPhone|iPad|iPod/` or (`Macintosh` with `maxTouchPoints > 1`), else Google (`https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=driving`); with no plottable point (`isPlottablePoint` false) the URL-encoded full address replaces the coordinates. `NavigateButton` MUST be `<a target="_blank" rel="noopener noreferrer">` with text "Navigate" and accessible name "Navigate to {address} (opens maps)".
- **FR-053**: `PropertyAddressSection` MUST use `buildNavigationUrl` (Apple on iOS, Google elsewhere) keeping the `data-testid="open-maps-link"` and "Navigate to property" text.

**Data layer**

- **FR-040**: `useDayPlan(date, { enabled })` MUST query `GET /v1/inspector/day-plans/:date` with key `['inspector','day-plan', date]`; 404 `DAY_PLAN_NOT_PUBLISHED` → `state 'NOT_PUBLISHED'` (no retry); 404 `DAY_PLAN_NOT_FOUND` → `state 'NOT_FOUND'`; 200 `status 'STALE'` → one refetch after 2000 ms per version (no loop); network error with cache → keep old `data`, `isOffline true`; 5xx → error with the provider's 2 retries; `enabled:false` → no call.
- **FR-041**: `useDayPlanOrigin` MUST `PUT`/`DELETE …/origin`, `setQueryData` the date's key with the response, show the snackbars of FR-023, surface server `message` on 422/503/404 with the cache intact, and coalesce a double click to one request.
- **FR-042**: `useRouteSheetDownload` MUST `GET …/sheet?format=` with `parseAs:'blob'`, create and revoke the object URL, and surface the FR-025 messages.
- **FR-043**: `apiPut`, `apiDelete`, `apiGetBlob` MUST be added to `useApiQuery` in the same pattern as `apiPost` (with `withRetryAfter`). Check-in/out (`useExecutionActions`), the offline queue sync (`useOfflineQueue`), cant-do/late-notice (`useReportCantDo`/`useReportLateNotice`) and the SW `inspector-notice:received` listener in `PwaLayout` MUST also invalidate `['inspector','day-plan']`.
- **FR-044**: `useCivilToday()` MUST compute `todayInTzDateString(tz)` and recompute on `visibilitychange→visible`, `focus`, and a `setTimeout` to the next civil midnight (rescheduled each fire), changing the key so the new date's GET runs.
- **FR-045**: A test fixture `buildDayPlan(overrides)`/`buildStop(overrides)` MUST match `dayPlanResponseSchema` exactly (asserted by `dayPlanResponseSchema.parse(buildDayPlan())`).

**Shared & backend wiring (part of the "navigation" item)**

- **FR-030**: `INSPECTOR_NOTICE_TARGET_PATTERNS` MUST gain `/today` as an **exact static pattern** (F02 D24: no parameter, no trailing slash, case-sensitive segment match); `inspectorNoticeDeepLink` is unchanged. `PublishDayPlansUseCase` and `RecalculateDayPlanUseCase` MUST pass `targetPath: '/today'` on `ROUTE_PUBLISHED`/`ROUTE_CHANGED`; the F02 validator MUST accept `/today` and reject `/today/route/x`. These ship in this same PR (Achado 8, DB7).
- **FR-031**: `formatInstantTime(value, timeZone)` MUST be added to `packages/shared/src/utils/format-display-date.ts` and exported from the index: `'2026-11-04T21:10:00.000Z' , 'Australia/Sydney'` → `8:10 am`; midnight → `12:00 am`; `null`/`''` → `''`; an invalid string returned intact; identical under `TZ=America/Los_Angeles`.
- **FR-032**: `src/sw/runtime-caching.ts` MUST add exactly one NetworkFirst route for `^/v1/inspector/day-plans/\d{4}-\d{2}-\d{2}$` (GET only) with `cacheName 'api-day-plan-cache'`, `networkTimeoutSeconds 10`, `expiration { maxEntries: 3, maxAgeSeconds: 12*60*60 }`, `cacheableResponse { statuses:[200] }`, leaving the existing 5 routes unchanged; `INSPECTOR_API_CACHES` in `useAuth.tsx` MUST include `api-day-plan-cache` so logout deletes it.
- **FR-033**: The SW `push-handlers.ts` `resolveClickTarget` MUST open `/today` for a route notice (fallback `/profile/announcements` unchanged); other announcement pushes still open `/profile/announcements/{id}`.
- **FR-034**: `apps/pwa/CLAUDE.md` MUST be updated in this PR: remove the "from F04" transition clause of rule N10 (X00 L-X00-04) while keeping the `GET /v1/inspector/day-plans/:date` → `api-day-plan-cache` mention; document the new route structure, the `api-day-plan-cache` and its logout cleanup. The root and `apps/pwa` CLAUDE.md are updated as part of the PR (one-line rebase discipline on shared docs). Verification: `grep -n "from F04" apps/pwa/CLAUDE.md` empty and `grep -n "api-day-plan-cache" apps/pwa/CLAUDE.md` ≥ 1.

**Pure libs**

- **FR-060**: `format-route.ts` MUST provide `formatDriveDuration` (0→"0 min", 59→"1 min", 2580→"43 min", 3900→"1 h 5 min"), `formatDistance` (650→"650 m", 2140→"2.1 km", null→""), `formatLeg` ("6 min drive · 1.0 km" and with wait "· wait 25 min for window"), `formatCivilDateLong('2026-09-18')`→"Friday, 18 Sept" (TZ-independent), `greetingFor` (07:00→"Good morning", 12:00→"Good afternoon", 18:00→"Good evening").
- **FR-061**: `day-plan-view.ts` MUST provide pure selectors over `DayPlanResponse`: progress `{done,total}` (done = `appointmentStatus 'DONE'`), next (first `NOT_STARTED`, derived live — DB11), in-progress label, `allDone`, `empty`, coming-up (3 following non-executed), and stable ordering by `sequence`.

### Key Entities *(consumed, not created)*

- **DayPlanResponse**: the inspector's published plan for one civil date — `status`, `version`, `timezone`, `origin`/`originWarning`/`originOverride`, `departureAt`/`finishEta`, `totals`, `feasible`/`violations`, `suggestedOrder`, `stops[]`, `geometry`, `routingInput`. Read-only in the PWA; replaced wholesale by `PUT/DELETE …/origin` responses. No `tenant_id` (platform-scoped, per-inspector).
- **DayPlanStop**: one stop — `appointmentId`, `sequence`, `appointmentStatus`, `executionStatus`, `executed`, `eta`/`serviceStartAt`/`serviceEndAt`, `travelS`/`distanceM`/`waitS`/`lateS`, `windowStart/End`(+`At`), `timezone`, `durationMinutes`, `lat`/`lng`/`missingCoordinates`, `propertyAddress`/`suburb`, `keyRequired`/`meetingLocation`, `primaryContact {name,phone,role}`.
- **InspectorBaseAddress**: structured AU address (Street/Number/Unit/Suburb/State/Postcode, `city = suburb`, `country 'AU'`) — the body of `PUT …/origin`, identical to the F01 profile shape.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (00.1/00.5)**: 100% of logins with no saved redirect land on `/today`; the bar is Today/Schedule/Offers/More; Earnings, Announcements and the profile live in More; `nav-clearance-contract.test.ts` passes unchanged.
- **SC-002 (01.A1, list part)**: the Today screen and Route show the sequence, predicted times, predicted finish, driving and waits from the published plan, verified by RTL tests over the fixture.
- **SC-003 (01.5)**: the stop card shows address, window, predicted time, key/meeting-location and call; tapping opens the existing detail — covered by `StopCard`/`TodayPage`/`RoutePage` tests.
- **SC-004 (01.6)**: Navigate opens Apple Maps on iOS/iPadOS and Google Maps elsewhere, on the card and in the detail — covered by `navigation-url` and `PropertyAddressSection` tests.
- **SC-005 (Base do dia)**: the inspector changes the origin for that day only (today before the first check-in, or tomorrow once published), sees "(this day only)" and can revert; with no base sees the NO_BASE warning; after the first check-in sees "Continuing from: {suburb}" with no pencil (L-F04-07).
- **SC-006 (contact role, L-F04-08)**: the call link shows the contact role ("Call Sam Lee (tenant)", "property manager", or no label for OTHER).
- **SC-007 (DB7)**: `/today` is on the allowlist (the only constant change), `ROUTE_PUBLISHED`/`ROUTE_CHANGED` carry `targetPath '/today'`, and the unread badge is on the More tab; the inbox, deep link and SW fallback are unchanged.
- **SC-008 (states)**: loading, empty, not-published ("ready at 7:30 pm"), STALE, approximate, error and offline behave exactly as specified.
- **SC-009 (gates)**: `pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test && pnpm --filter pwa lint && pnpm --filter pwa typecheck && pnpm --filter pwa test && pnpm --filter pwa build && pnpm --filter pwa check:ds && pnpm --filter backend test -- day-plan inspector-notice` all green; QA Q1–Q16 marked in the PR; `git diff --stat origin/develop... | tail -1` ≤ 150 files.
- **SC-010 (privacy)**: the plan cache (`api-day-plan-cache`, which carries tenant contact name/phone) is in `INSPECTOR_API_CACHES` and is deleted on logout; only 200 responses are cached; TTL 12 h and `maxEntries 3` bound device retention — covered by the `useAuth` test and QA Q12.

## Assumptions

- **Premise (Q9, decided)**: the "7:30 pm" publication text is fixed and expressed in the agency timezone; the PWA shows it verbatim on 404 `NOT_PUBLISHED` and never derives it from the device clock.
- **Premise (L-F04-03 = Plan A, decided)**: the Mapbox consultation allows the raw matrix to reach the client, so `routingInput` (raw matrix + per-leg Directions durations) is present in the `GET` response. This task does not implement local reorder (TASK-F04-4), but the data layer and fixture assume `routingInput` exists; if Plan B were ever chosen, only TASK-F04-4 changes variant, not this task.
- **Premise (F01 D11 / DB4)**: INSP has no address autocomplete in the PWA; the OriginSheet uses structured fields and sends a structured address to `PUT …/origin`.
- **Premise (DB11)**: the reorderable/next set is derived live from `executed: false`, never persisted client-side.
- The F04-2 endpoints are deployed to production before this PR (without them the Today home would error); backend `targetPath` and the PWA ship in the same deploy/PR.
- F01-3, F02-3 and F03-3 are merged, so `BaseAddressBanner`, the announcements inbox + unread badge, the SW `injectManifest` setup, the `AppointmentCard` action bar and `useExecutionActions`/field-event hooks exist as described.
- No feature flag: the home changes for everyone on the first load after deploy (SW `autoUpdate`); a non-critical OP notice announces it; the F04-3b tour reinforces it later.
- Map and reorder (TASK-F04-4), the app tour (TASK-F04-3b), Challenges (F08) and the v3 "Help and support" / maintenance / photos / key-control / pinned-notices items are out of scope.
