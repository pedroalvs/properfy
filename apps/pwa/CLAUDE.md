# PWA Inspector App – Guidance for Claude Code

You are working inside **`apps/pwa/`** of the Properfy monorepo.

The PWA is a **mobile-first Progressive Web App** for property inspectors in the field. It provides the tools for inspectors to manage their schedule, accept marketplace offers, execute inspections with geolocation evidence, and track their earnings.

---

## 1. Tech stack

- **Build tool:** Vite (with `vite-plugin-pwa` + Workbox)
- **Framework:** React
- **Language:** TypeScript
- **Styling:** Tailwind CSS with a shadcn-style design system (see `docs/design-system.md`)
- **Font:** Inter (self-hosted via `@fontsource-variable/inter`)
- **Icons:** `lucide-react`
- **Maps:** Mapbox (`mapbox-gl`) for the offers map and the day-plan route map, via the shared toolkit in `src/lib/map/`
- **Drag & drop:** `@dnd-kit/*` (core/sortable/modifiers/utilities) — only the route reorder list (F04-4)
- **Geolocation:** Browser Geolocation API
- **HTTP client:** OpenAPI-generated client (same contracts as web)
- **State:** React Query + local state
- **Forms:** React Hook Form + Zod, with schemas from `@properfy/shared`
- **Shared standards:** `@properfy/frontend-standards` (`cn()`, CVA, timing/z-index/touch constants)
- **Offline:** Service Worker with Workbox (cache-first for static, network-first for API)
- **Tests:** Vitest (unit/component). Playwright E2E (`tests/e2e`, 4 mobile/tablet projects) is a CI gate (`test-pwa-e2e`) — hermetic (every API call mocked), Chromium + WebKit. See §10.

Do **not** change the stack unless explicitly instructed.

---

## 2. Development commands

```bash
# Install dependencies (from repo root)
pnpm install

# Start dev server
pnpm --filter pwa dev

# Build for production (generates SW)
pnpm --filter pwa build

# Preview production build
pnpm --filter pwa preview

# Run tests
pnpm --filter pwa test

# Lint
pnpm --filter pwa lint

# Typecheck
pnpm --filter pwa typecheck

# Design-system guard (no retired tokens/classes/*Screen/template classNames)
pnpm --filter pwa check:ds

# E2E (Playwright, 4 mobile/tablet projects, hermetic). Requires both workspace
# dist/ built first (globalSetup guards this). Override the strict port per worktree
# with PWA_E2E_PORT if 5175 is taken.
pnpm --filter pwa test:e2e
```

---

## 3. Project structure

```text
apps/pwa/
├── src/
│   ├── app/                    # App shell wiring: router, providers, SW registration, useNoticeOpenedFromPush
│   ├── sw.ts                   # injectManifest service-worker entry (F02-3)
│   ├── sw/                     # SW pure helpers: runtime-caching.ts, push-handlers.ts (unit-tested, WebWorker lib)
│   ├── components/
│   │   ├── shell/              # PwaLayout (app frame + push resync/SW-message wiring), BottomNavBar (unread badge), TopBar, TwoPaneLayout + WidePaneContext (wide master-detail)
│   │   ├── ui/                 # Design-system primitives (see docs/design-system.md)
│   │   └── feedback/           # OfflineBanner, EmptyState, LoadingState, ErrorState (snackbar: hooks/useSnackbar)
│   ├── features/
│   │   ├── auth/               # Login, forgot/reset password, access-denied/deactivated
│   │   ├── schedule/           # Daily schedule list + appointment detail (AppointmentDetailPage)
│   │   ├── offers/             # Marketplace offers list, offers map, accept flow
│   │   ├── execution/          # Start/finish inspection (geolocation capture)
│   │   ├── earnings/           # Earnings summary, inspector invoice history, request invoice
│   │   └── profile/            # Inspector profile, security (2FA), sessions, install app
│   ├── services/               # API clients (generated from OpenAPI)
│   ├── hooks/                  # Shared hooks (useAuth, useApiQuery, useIsOnline, useGoBack, useMediaQuery, useSnackbar, …)
│   ├── lib/                    # Helpers (format-date, status-colors, geo, idempotency, map-bounds, …)
│   ├── styles/                 # tokens.css (CSS custom properties)
│   └── main.tsx
├── public/                     # icons/, images/, _headers, _redirects (the web manifest is generated from vite.config.ts)
├── docs/
│   └── design-system.md        # Tokens, primitives, form pattern, anti-patterns
└── ...
```

The shared map toolkit lives in `src/lib/map/` (`useMapboxInstance`, `useMapCamera` — generic over
`points: {id,lat,lng}[]`, `markers` with `makeNumberedMarkerEl({label,variant,ariaLabel})`, `colors`,
`useGeoJsonLineLayer`, `MapStatusOverlay`, `bounds`); both the offers map (`features/offers/`) and the
day-plan route map (`features/day-plan/components/RouteMapView.tsx`) consume it (F04-4 promoted it out of
`features/offers/`). There is **no** `features/appointments/` feature: appointment detail lives in
`features/schedule/` (`AppointmentDetailPage.tsx`). The app frame is `PwaLayout` (there is no `MobileShell`).

---

## 4. Core features

### 4.1 Marketplace offers (`features/offers`, route `/marketplace`)

- `GET /v1/marketplace/offers` – List available service group offers (`GET /v1/marketplace/offers/:groupId` for one)
- Display grouped inspections by date/region; a Mapbox map (`OffersMapView`) plots the pins
- **Accept flow:** `POST /v1/marketplace/offers/:groupId/accept` with `Idempotency-Key`
- First valid acceptance wins (concurrent accept handled by backend)
- Show offer details: date, time window, region, service count, payout estimate

### 4.2 Daily schedule (`features/schedule`, route `/schedule`)

- `GET /v1/inspector/schedule?date=YYYY-MM-DD` – List day's appointments
- `GET /v1/inspector/schedule/month` – month overview for the calendar
- Display as a list sorted by time slot
- Show: property address, service type, time, tenant confirmation status
- **T-1 rule filtering:**
  - `Routine Inspection`: only show if tenant confirmed (or exception applies)
  - `Ingoing/Outgoing`: show when `SCHEDULED`
  - Exceptions: `key_required = true`, manual OP confirmation
- **Card actions (F03-3, contract 00.A3).** `AppointmentCard` is an `<article>` (not a `<button>` — never nest a button) with a nav target (`data-testid="appointment-card-{id}"`) plus, for `SCHEDULED` jobs, `AppointmentCardActions`: a primary "Check in"/"Check out" button (phase from `useLocalExecutionState`, **not** a server field — the day payload has none; "Check in" disabled off the inspection day with "Available on inspection day", using `useEffectiveTimezone`) and a "More actions" menu (`aria-haspopup="menu"`) opening "Running late" (today + not in progress) and "Can't do this job". Check-in uses `captureRequiredLocation` (`features/execution/lib/geolocation.ts`) then `useExecutionActions().checkIn`; an `outOfRadius` FLAG success shows a warning snackbar, a BLOCK 422 keeps the card on "Check in". Check-out `queryClient.fetchQuery`'s the detail (for `inspectionAppLink`), falling back to `/execution/:id` when offline-uncached, then renders the Sync/Past-time modals from the card.

### 4.3 Inspection execution (`features/execution`)

**Start inspection:**

- `POST /v1/inspector/appointments/:appointmentId/start`
- Capture: `latitude`, `longitude` (Geolocation API)
- Validate geolocation is within acceptable radius of property

**Finish inspection:**

- `POST /v1/inspector/appointments/:appointmentId/finish`
- Capture: `latitude`, `longitude` (Geolocation API)
- Finish is geolocation + timestamp only (scope 7.5). There is no inspector checklist or finish-notes capture.

**Execution flow:** `SCHEDULED → start (capture geo) → finish (capture geo) → DONE`

- **`useExecutionActions(appointmentId)` (F03-3)** is the single owner of the IndexedDB `ExecutionState` (check-in, check-out request with SYNC/PAST_TIME steps, submit, retry). `ExecutionPage` and `AppointmentCard` both drive it so they never write that state independently. `useStartInspection`/`useFinishInspection` bodies carry `accuracy` + `clientOccurredAt` (online and queued; old `{latitude,longitude}` items still sync).
- **Geofence (F03-3, contract 03.A2).** `GeoLocationCapture` takes `radiusMeters` from the detail `geofence` (default `PLATFORM_SETTINGS_REGISTRY.fieldEvents.defaults.geofenceRadiusMeters` = 300); it only **warns** ("You are {d} m from the property (limit {r} m)…") and never disables Start/Check-in. BLOCK is server-enforced: the app shows the 422 message, no client pre-check.
- **Permanent queued-START cleanup (F03-3, D21/L-F03-02).** `useOfflineQueue` classifies a START sync failure with `isPermanentQueueError` (4xx except 401/408/429; a `422 GEOFENCE_OUT_OF_RADIUS` is permanent on the first response, no retry): it marks the item FAILED, removes the chained FINISH, `clearExecutionState` + `emitExecutionStateChange` (so a mounted card reverts to "Check in"), `refreshQueueSnapshot`, invalidates `['inspector','schedule']` and `showError`s. A cross-instance notifier (`features/execution/lib/execution-state-events.ts`) lets `useLocalExecutionState` re-read after such external clears. 5xx/network stay PENDING+retry; 401 clears nothing.

### 4.4 Appointment detail (`features/schedule`, route `/schedule/:appointmentId`)

- `GET /v1/inspector/appointments/:appointmentId`
- Show: property info, contact details, restrictions, meeting location, key info
- Contact tenant directly (phone/SMS link)
- **Field-event actions (F03-3).** For `SCHEDULED` jobs the detail shows secondary "Running late" / "Can't do this job" buttons below the start CTA; `InProgressPanel` adds a "Can't complete this job" link (rejection after check-in) that clears the local draft and releases the navigation blocker before redirecting to `/schedule`. When the detail carries `lastFieldIssue` (the inspector's own last `CANT_DO` on a re-offered job, L-F03-09) an info alert shows "You reported '{label}' on {dd/MM/yyyy}. This job was offered again." The detail type (`features/schedule/types`) + `mapInspectorAppointmentDetail` adapter surface `geofence`, `lastFieldIssue`, `propertyId` (F10-3) and (defensive, F04) `publishedServiceStartAt`.
- **Property files & issues (F10-3).** The detail mounts `<PropertyFilesSection>` (`features/property-files/`) after Job Details: a read-only **Files** section with `Segmented` subtabs (Issues first → Documents → Reports → Other) + per-type counts (C.9), issue cards (reason / origin badge / date — the author is masked server-side for the inspector, no seen-status), and per-file open/download via a 5-min signed URL (`useFileDownload`; image/PDF open in a new tab, HEIC downloads, D13). **Online-only:** `usePropertyFiles`/`usePropertyIssues` are plain React Query reads with **no service-worker cache** and no `INSPECTOR_API_CACHES` entry — offline shows "connect to load", never stale files. **Report issue** (`ReportIssueSheet`) and the F03-3 **Can't-do** sheet both create a `PropertyIssue` via presign→PUT→confirm→create (§8); both are status-independent for Report-issue (FR-022) and the Can't-do photo path only runs where `propertyId` is available (the detail — `CantDoSheet.propertyId` is optional, absent on the schedule-card/execution quick-action). `useReportCantDo` now **returns** the `CantDoResponse` (`eventId`) so the sheet can link the issue via `cantDoEventId` after the decline (D18 — a failed issue-create never reverts the decline). This slice consumes the F10-1 contract only — **no backend/schema/`api-types` change** (D19).

### 4.5 Earnings (`features/earnings`, route `/earnings`)

- Financial summary (current period)
- Inspector invoice history (`InvoiceListPage`, `InvoiceDetailPage`) and request flow (`RequestInvoicePage`)
- Per-appointment payout details

### 4.6 Profile (`features/profile`, route `/profile`)

- Tile grid with sub-routes: `/profile/account`, `/profile/availability`, `/profile/documents`, `/profile/settings` (security, 2FA, sessions, install app). `/profile/edit` redirects to `/profile/account`.
- **Base address (F01-3, contract 00.4).** `/profile/account` has an inline "Base address" card (`id="base-address"`) that edits the inspector's base via `PATCH /v1/inspectors/me {address}` (geocoded server-side in permanent mode). It validates with the shared `inspectorBaseAddressSchema` + `AU_STATES` and sends `city = suburb`, `country = 'AU'`, no client coordinates; a saved address that does not parse is legacy-incompatible (fields stay empty with a re-entry prompt, never normalised). `BaseAddressBanner` (`components/feedback/` — shared so the schedule home can mount it without a cross-feature import) is a fixed, non-dismissable prompt shown on `/schedule` and `/profile` while `useInspectorMe().data.baseLat == null` (variant 1 "Add your base address" / variant 2 "We couldn't locate…"); it disappears once a save with coordinates invalidates `['inspector']`. `/v1/inspectors/me` has no response schema, so `useInspectorMe`/`useUpdateInspectorSelf` type the base fields manually; never read the base from `/v1/me` (its schema strips it).
- **App settings (`/profile/settings`).** Content order is a reserved empty `[data-testid="push-preference-slot"]` (F02 fills it, D8) → `InstallAppCard` → a "Show app tour" `MenuRow` (F04-3b, `navigate('/today', { state: { replayTour: true } })`) → a version footer `Properfy Inspector v{__APP_VERSION__}`. The `ProfilePage` menu has an "App settings" `MenuRow` → `/profile/settings` above "Log out" (F04-3, since the More tab is the design-v3 home for it).
- **App version.** `__APP_VERSION__` is a Vite `define` (`vite.config.ts`, applies to Vitest too) = `buildAppVersion(pkg.version, process.env.APP_BUILD_SHA)` from `apps/pwa/src/lib/app-version.ts` → ``${version}+${sha7}`` (`+dev` locally). CI sets `APP_BUILD_SHA` on the three PWA build steps (`frontend-deploy.yml`); it is read in Node, never `VITE_`-prefixed.
- **App-state heartbeat (F01-3, contract 00.10).** `useAppStateHeartbeat()` (`src/app/`) is called from `PwaLayout`; it POSTs `/v1/inspectors/me/app-state {displayMode, pushPermission, appVersion}` on mount and on `visibilitychange`→visible, throttled to once per 6 h per device via the `localStorage` key `properfy.pwa.appStateHeartbeat` (written only on 204/429). It takes injected `storage`/`send`/`now` for tests; errors are silent. `getIsStandalone()` is exported from `useInstallPrompt.tsx` for it. Logout clears the throttle key in `lib/auth-storage.ts` (`clearTokens`).

### 4.7 Today & Route (`features/today` + `features/day-plan`, routes `/today`, `/today/route[/:date]`)

- The app **home** (F04-3). `/today` (`TodayLayout` → `TwoPaneLayout fillHeight`, master `TodayPage`, detail `<Outlet/>`) shows the greeting, progress (`{done} of {total} done · finish ~hh:mm`), the **Next inspection** card, **Coming up** list, unread-announcements card and a **tomorrow** card. `/today/route[/:date]` (`RoutePage`, detail pane on tablet) is the list view: summary, `OriginRow` (per-day base), ordered stops with `RouteLegRow` legs, and a PDF/XLSX `RouteSheetMenu`. Consumes the F04-2 contract read-only (`GET/PUT/DELETE /v1/inspector/day-plans/:date[/origin]`, `…/sheet`); `:date` comes from `useCivilToday()` (inspector tz, never device). The map tab and reorder controls are added by **F04-4** (see §4.7 "Map & reorder").
- **Data layer:** `useDayPlan` (states `OK/STALE/NOT_PUBLISHED/NOT_FOUND/ERROR` + `isOffline`; one STALE refetch per version), `useDayPlanOrigin` (PUT/DELETE → `setQueryData`), `useRouteSheetDownload` (blob), `dayPlanKeys` (`['inspector','day-plan', date]`); pure libs `day-plan-view`, `format-route`, `navigation-url`. Check-in/out, cant-do, offline-queue sync and the SW `inspector-notice:received` message all invalidate `['inspector','day-plan']`.
- **Reuse:** `AppointmentActionBar` is extracted from the schedule card (`features/execution/components/`, `ExecutionActionTarget` + `stopToActionTarget`) and drives both; `BaseAddressFields` is extracted from `ProfileAccountPage` (`features/profile/components/`, shared schema/`toInspectorBaseAddress`) and feeds both the profile card and the `OriginSheet`. `NavigateButton`/`buildNavigationUrl` (Apple on iOS/iPadOS, Google elsewhere) is reused by `PropertyAddressSection`.
- **Contact privacy:** the plan carries tenant `primaryContact` name/phone, so `api-day-plan-cache` is in `INSPECTOR_API_CACHES` (logout-cleared) and caches 200s only.
- **Map & reorder (F04-4).** `/today/route` adds a `Segmented` List/Map tab (state in `?view=map`, replace; Map is `React.lazy`). `RouteMapView` (lazy) draws numbered pins in the current order, an origin marker (omitted for `NONE`/`LAST_STOP`, L-F04-07) and the real Directions line (solid + dashed-approximate, from `plan.geometry`), via `src/lib/map/`; a dirty reorder draft renumbers pins and hides the line ("Save to update the route line"). Reorder (`ReorderableStopList` with `@dnd-kit` drag + up/down arrows) evaluates the order **on the server** (F04 Plan B PR-B, Mapbox ToS): it no longer reads `plan.routingInput` or runs the optimizer on the client. `useReorderPreview` previews the draft order via `POST /v1/inspector/day-plans/:date/order/preview` (`usePreviewDayPlanOrder`, debounced 400 ms, `keepPreviousData`, cached per `plan.version`/order) and the aligned suggested order (cached, skipped when the draft equals it) to derive "+N min vs. suggested"; the server returns `etaSource 'MATRIX'` so ETAs render with "~". `reorder-preview.ts` holds the pure mappers (`buildReorderPreviewView`, `classifyPreviewReason`, `formatDelta`/`formatDrivingTotal`/`formatLocalEta`, `toViolationMessages`, `previewUnavailableMessage`); `reorder-draft.ts` keeps only the order/set helpers (`getReorderableSets`, `moveItem`/`moveUp`/`moveDown`, `alignOrder`, `canReorder` = ≥ 2 not-started stops, **no `routingInput` dependency**). Window warnings never block Save (DB3). A 200 `approximate` preview (the server degraded to the straight-line stub on a Mapbox rate-limit/provider error) still shows the numbers but flags them "Approximate route: travel times are estimates", like the GET banner — never as authoritative MATRIX times. When the preview can't run — offline, 429, or provider error — the list stays usable, no numbers are shown as final, and Save follows its normal rules. (Since F04 Plan B PR-C the preview also serves a started day — not-started tail from the last stop, matching `PUT /order` — so it no longer returns 422 `DAY_PLAN_ALREADY_STARTED`; the PWA keeps a defensive handler but the case no longer occurs.) The move a11y announcement is two-step: position immediately, finish/delta once the preview resolves. The draft is owned by `RoutePage` (shared across both tabs); `useReorderDraft` derives the reorderable set live (only `executionStatus 'NOT_STARTED'`, incl. this-device check-ins via the F03 execution state), freezes a dirty draft on a newer version (Review to adopt), discards it when the reorderable set changes, and blocks Save while STALE/offline. (The map still reads `plan.geometry`, unchanged.) `ReorderSaveBar` saves via `PUT …/order` (`{appointmentIds, basedOnVersion}`, no `Idempotency-Key`) and maps 409 `DAY_PLAN_VERSION_CONFLICT`/`DAY_PLAN_STALE`, 422 `DAY_PLAN_ORDER_MISMATCH`/`DAY_PLAN_DATE_IN_PAST`, 429 and network to reload/retry messages; "Reset to suggested order" is local when dirty, else confirms and calls `POST …/recalculate` (`useResetDayPlanOrder`). Consumes the F04-1/2/3 contracts only — no backend/schema/api-types change. `routingInput` is fully removed from the shared contract (F04 Plan B PR-C); the PWA fixtures no longer set it, and `POST …/order/preview` now also serves a started day (not-started tail from the last stop), matching `PUT /order`.

### 4.8 App tour (`features/tour`, F04-3b, contract 00.2 / 00.A1)

- A self-contained coach-mark tour, mounted app-wide by `AppTourHost` in `PwaLayout` (portal on `document.body`, outside the inert `#root`). No tour library, **no new dependency**.
- **Opens once** on the inspector's first visit to `/today` after login, when `useInspectorMe().data.data.onboardingCompletedAt == null`, no local pending record for the user, and the day plan has settled. A module-level guard opens it at most once per load. Completing or skipping POSTs `/v1/inspectors/me/app-state { …heartbeat fields, onboardingCompleted: true }` once (bypassing the 6h heartbeat throttle) and invalidates `['inspector','me']`; a failed POST writes `localStorage` `properfy.pwa.tourCompletedPending = <userId>` (cleared on logout in `lib/auth-storage.ts`, retried on next mount / `online`). Consumes TASK-F04-2's contract read-only — **no backend/schema/api-types change**.
- **Replay:** More → App settings → "Show app tour" opens on `/today` via `navigate('/today', { state: { replayTour: true } })` and sends **no** completion POST.
- **Steps (frozen, L-F04-12):** 8 target steps + 1 install step → 9 in a browser, 8 in standalone (install omitted); the install step shows only outside standalone, platform-adaptive via `useInstallPrompt` (iOS Share / Android `promptInstall()` / manual). Target steps whose anchor is absent (e.g. no stops today) are skipped and the counter recomputes.
- **`data-tour` anchor convention:** the tour resolves `[data-tour="<key>"]` for each target step. The frozen keys are `nav-today` / `nav-schedule` / `nav-offers` / `nav-more` (`BottomNavBar` tabs), `today-next` + `today-next-actions` (`NextInspectionCard`), `today-more-actions` (`AppointmentActionBar` more-actions button, shared with the schedule card — inert there), and `today-route-link` (`TodayHeader` "Route" link). A new tour target adds a `data-tour` to the real element and a step to `features/tour/lib/tour-steps.ts`.
- **Pure engine (unit-tested, Prisma-free):** `lib/tour-geometry.ts` (spotlight + balloon placement), `lib/tour-steps.ts` (`resolveTourSteps`), `lib/focus-trap.ts`, `lib/tour-pending-storage.ts`; hooks `useTargetRect` (MutationObserver + rAF), `usePrefersReducedMotion`, `useAppTourController` (open/record/replay, injectable storage/API). The overlay uses a `box-shadow` spotlight (not `clip-path`), `inert` + `aria-hidden` on `#root` (always restored), a custom focus trap, Escape = Skip, and reduced-motion support. 00.A1 is proven by `tests/e2e/app-tour.spec.ts` (E1–E6, phone projects only).

---

## 5. PWA configuration

### Service Worker

- Strategy: **`injectManifest`** with a custom `src/sw.ts` (F02-3) — it precaches (`precacheAndRoute(self.__WB_MANIFEST)`), keeps the SPA navigation fallback (`NavigationRoute → index.html`), registers the runtime caches (`src/sw/runtime-caching.ts`, 6 routes — F04-3 added `api-day-plan-cache`) and adds `push`, `notificationclick` and `pushsubscriptionchange` handlers (pure helpers in `src/sw/push-handlers.ts`, unit-tested). `src/sw.ts`/`src/sw/**` typecheck under `tsconfig.sw.json` (WebWorker lib) and are excluded from the main tsconfig. The push target allowlist is the shared `isAllowedInspectorNoticeTargetPath` (no local normalization). Output stays `dist/sw.js`, so a rollback to `generateSW` swaps the same file.
- Register type: **`autoUpdate`** — new versions activate automatically on next load (`skipWaiting` + `clientsClaim`, no update prompt)

### Caching

- **Static assets:** precached at build (JS, CSS, HTML, images, fonts); Google Fonts CacheFirst
- **API requests** (`vite.config.ts` `runtimeCaching`):
  - `/v1/inspector/schedule*` → NetworkFirst, `api-schedule-cache` (24 h, 50 entries, 10 s network timeout, `cacheableResponse: [200]`)
  - `/v1/inspector/appointments/*` → NetworkFirst, `api-appointment-cache` (5 min, 100 entries, `cacheableResponse: [200]`)
  - `/v1/inspector/day-plans/{YYYY-MM-DD}` (dated GET only; **not** `/sheet`, writes, `…/origin`, `…/recalculate`, or AM/OP `/v1/day-plans/*`) → NetworkFirst, `api-day-plan-cache` (12 h, 3 entries, 10 s network timeout, `cacheableResponse: [200]`) — F04-3
  - `/v1/marketplace/offers` → NetworkOnly (offers are never served stale)
- **In memory:** TanStack Query `networkMode: 'offlineFirst'`, `gcTime` 24 h (`QueryProvider.tsx`)
- **Logout wipes inspector data:** every API cache name is listed in `INSPECTOR_API_CACHES` (`hooks/useAuth.tsx`) and deleted on logout together with the offline queue, so a shared device never shows the previous inspector's data. A new inspector cache MUST be added to that list.
- **Today's work must stay readable offline.** Any inspector read endpoint that the day depends on (today's schedule, appointment detail and the day plan `GET /v1/inspector/day-plans/:date` in `api-day-plan-cache`) uses NetworkFirst with a 10 s network timeout, like the existing caches. **Required for every new inspector cache** (the two existing caches now set `cacheableResponse: [200]` too, in `src/sw/runtime-caching.ts`): `cacheableResponse: { statuses: [200] }` (an error such as "not published" is never cached as data), `maxAgeSeconds` ≤ 12 h and `maxEntries` ≤ 10 unless the task says otherwise, its cache name added to `INSPECTOR_API_CACHES` (exported from `hooks/useAuth.tsx`), and the fixed offline copy in the UI: "Offline · showing your last saved <thing>" with cache, "You're offline. Connect to load <thing>." + Retry without. Write actions keep using the offline queue; new write actions require a connection unless their task says otherwise. Downloads (e.g. the route sheet) and AM/OP routes are never cached.

### Manifest

- Display: `standalone`
- Orientation: `portrait`
- Theme color: aligned with Properfy brand

---

## 6. Mobile-first design rules

### Navigation

- **Bottom navigation bar** (`BottomNavBar`) with exactly four tabs (F04-3):
  - **Today** → `/today` (the home; active across `/today/*`)
  - **Schedule** → `/schedule`
  - **Offers** → `/marketplace`
  - **More** → `/profile` (the existing profile hub, URLs unchanged; active across `/profile/*` and `/earnings/*` — Earnings lives inside More). The unread-announcements badge is on More.
- **Top bar** (`TopBar`) with contextual title/actions and connection status
- No sidebar (mobile-first)
- Login and the index/`*` fallback land on `/today`.

### Layout

- Full-width cards
- Large touch targets (min 44px — `TOUCH_TARGET_PX` from `@properfy/frontend-standards`)
- Pull-to-refresh on list views (`PullToRefresh` primitive)
- Respect the iOS safe-area insets (`safe-b*` / `nav-clear` spacing tokens)

### Visual tokens

The design system is documented in `docs/design-system.md`. In short:

- **shadcn HSL tokens** (`--primary`, `--background`, `--foreground`, `--muted`, `--destructive`,
  `--success`, `--warning`, …) consumed via Tailwind classes with native `/opacity` — these are
  the primary palette.
- **`pill-*` tokens** (green/amber/blue/red/gray bg+fg pairs) for status pills.
- A small set of **legacy domain tokens** (`status-*`, `sg-*`, `confirmation-*`, `flow-*` and
  `text-primary`) remain as function colours and are consumed via inline `style` in
  `src/lib/status-colors.ts`. Do not convert these without reworking `status-colors.ts`.
- Font is **Inter**; `secondary`/`accent` intentionally keep legacy brand values (some
  not-yet-restyled headings depend on them — see `docs/design-system.md`).

### Offline behavior

- Show connection status indicator (online/offline)
- Allow viewing cached schedule when offline
- Show clear feedback when offline

---

## 7. Geolocation

- Use Browser Geolocation API (`navigator.geolocation`)
- Request permission on first use with explanation
- Handle permission denied gracefully
- Capture coordinates at inspection start and finish
- Proximity: the app warns above 200 m (`GeoLocationCapture.tsx`), the backend audits above 500 m. The two thresholds differ today; F03 replaces both with the `PlatformSetting` geofence radius served to the app.

---

## 8. Evidence & photo upload

Inspection **finish** is still geolocation + timestamp only — there is **no inspection-evidence upload** (§4.3). The only photo upload in the PWA is **issue photos** (F10-3, `features/property-files/`): the "Report issue" and "Can't do this job" flows upload photos one at a time via presign → PUT (plain `fetch` to the signed URL) → confirm, then create a `PropertyIssue` that links them. The per-photo state machine lives in `useIssuePhotoUpload` and the shared picker in `PhotoPicker`; both are **online-only** (no offline queue, no auto-retry). Do not build any other upload UI outside this feature.

---

## 9. Global states

Every screen must handle:

1. **Loading:** Skeleton placeholders (not spinner alone)
2. **Error:** Friendly message with retry
3. **Empty:** "No appointments for today" / "No offers available"
4. **Offline:** Cached data with offline indicator
5. **Permission denied:** geolocation permission explanation

---

## 10. Testing

- **Unit/component tests** (Vitest): hooks, helpers, business logic, components. Mock geolocation/camera APIs; test offline scenarios.

### E2E (Playwright, `tests/e2e`) — restored by X03, a CI gate

- **Projects:** 4 — `Mobile Safari` (iPhone 13, WebKit), `Mobile Chrome` (Pixel 5), `Tablet (iPad portrait)` (iPad gen 7, WebKit, wide 2-column layout), `Foldable open` (Pixel 5 @ 840×1080, wide). The `app-tour` spec (F04-3b) runs on the 2 phone projects only (`skipOnWide`); the others run on all 4.
- **Prerequisite — build both workspace packages first:** `pnpm --filter @properfy/shared build && pnpm --filter @properfy/frontend-standards build`. `vite dev` resolves both only through `dist/`; without them `App.tsx`'s top-level import 500s and the shell never mounts (this was the original 56/56 failure). The Playwright `globalSetup` fails fast with a build message if a `dist/` is missing (rebuild both after a pull).
- **Server:** the suite starts its own `vite` on strict port **5175** (`PWA_E2E_PORT` to override per worktree), `reuseExistingServer: false` — it never reuses another worktree's / the web dev server. Context is pinned: `timezoneId: 'Australia/Sydney'`, `locale: 'en-AU'`, `serviceWorkers: 'block'`, and `webServer.env` fixes `VITE_API_BASE_URL=http://localhost:3000` + empty `VITE_MAPBOX_TOKEN` (map never initializes → no external request).
- **All API mocked via `tests/e2e/support/api.ts`.** Rules: `blockUnmockedApi(page)` registered **first** (last `page.route` wins); any unstubbed `/v1/**` returns `501 E2E_UNMOCKED` with a `console.warn` (a 501 never fails a test by itself — only a dependent assertion does); the catch-all is scoped to the API origin, **never** the `**/v1/**` glob (it would also catch Mapbox tiles); `/v1/me` is **plain** (no `data` envelope); no `window.fetch` monkey-patch (openapi-fetch captures `fetch` at client creation).
- **Baseline-stub rule:** `loginAsInspector` (tokens via `addInitScript`, never `goto+evaluate`) registers `BASELINE_STUBS` (`tests/e2e/support/auth.ts`): `GET /v1/me`, `POST /v1/inspectors/me/app-state` → 204 (the F01-3 heartbeat), `GET /v1/inspectors/me` (F01-3 base-address banner), the F02-3 unread-count/push-config reads, (F04-3b) a **prefix** stub for `GET /v1/inspector/day-plans/<date>` → a published plan (the Today screen reads it on load; the civil-date segment changes daily, so it uses `stubJsonPrefix`, not a flat exact-path entry), and (F10-3) empty-default `GET /v1/property-files` + `GET /v1/property-issues` (the appointment detail's Files section fetches both on render; `stubJson` matches the pathname only, so the presign/confirm/`:id/download` sub-paths are not shadowed). A spec overrides any of these after login (last route wins). **Every feature that adds a new authenticated-boot API call adds its default stub to `BASELINE_STUBS` in the same PR.** For standalone-only behaviour, `tests/e2e/support/standalone.ts` (`emulateStandalone`) forces the display-mode + `navigator.standalone` signals before boot.
- **Per-project restriction only via `tests/e2e/support/projects.ts`** (`skipOnWide`/`skipOnPhone` with a mandatory reason, `isWideProject`, `isWebKitProject`). All 4 projects set `isMobile: true`, so never branch on `isMobile`/`viewport.width`/`project.name` in a spec. Project names are a contract.
- **IndexedDB** is seeded only via `seedExecutionState` (`tests/e2e/support/idb.ts`, awaited `openDB` on a public route), **never** in `addInitScript` (races the app's `openDB`). Call it before `loginAsInspector` so the seeding `/login` load stays unauthenticated.
- **Fixtures** (`tests/e2e/support/fixtures.ts`, pure) mirror the `@properfy/shared` response schemas and are strict-parse-validated in `src/__tests__/e2e-fixtures.test.ts`.
- **Trace:** `pnpm --filter pwa exec playwright test <spec> --project="Mobile Chrome" --trace on` then `playwright show-trace test-results/<folder>/trace.zip` (Console + Network tabs).
- **CI gate (`test-pwa-e2e`):** runs all 4 projects (Chromium + WebKit) on every PR/push. It is a **deploy gate**, not a merge check — no branch has required status checks, but the deploy workflows require the whole CI run green, so a red `test-pwa-e2e` blocks DEV/STAGING/PROD deploys from the first merge. In CI `retries: 2`, `workers: 1`, and `failOnFlakyTests` is on (a test that only passes on retry turns the run red; evidence in the `test-results/e2e.json` artifact).
  - **Kill switch runbook:** systematic WebKit flake on `develop` → an admin sets repository variable `PWA_E2E_ADVISORY=true` (Variables, no PR) → the job shows green and only the step is red → open an issue, fix the cause, remove the variable. No acceptance criterion may be verified with the variable set.
- **WebKit-only residual rule:** a failure that remains only on WebKit → `test.fixme(isWebKitProject(testInfo), '<issue>')` with an open, deadline-bound issue; the fix is its own task. Never a silent `test.skip`, never `waitForTimeout`, never remove the WebKit project from CI. (Currently the `execution-finish` specs are `test.fixme` on WebKit — a cold deep-link-to-`/execution` session-restore race, tracked; fully covered on Chromium.)

---

## 11. Conventions for Claude Code

When you (Claude Code) implement or modify PWA code:

1. **Mobile-first always** – design for phone screen first, then adapt up.
2. **Use the design system** – compose classes with `cn()` and reuse `components/ui` primitives; never hand-build a template-literal `className`, never hard-code a hex colour. See `docs/design-system.md`. `pnpm check:ds` guards this.
3. **Respect the execution flow** – `SCHEDULED → start (capture geo) → finish (capture geo) → DONE`.
4. **Geolocation is critical** – always handle permission, errors and fallbacks.
5. **Offline support** – cached schedule, queued actions, clear feedback.
6. **Share types/schemas from `packages/shared`** for enums, IDs, DTOs and form validation.
7. **Language: English** for all user-facing text. Mock/seed data may retain Portuguese names.
8. **Performance matters** – compress images, lazy load routes, minimize bundle.
9. **Touch-friendly** – large targets (44px), no hover-dependent interactions.
10. **Business rules** (state machine, T-1) live in the root `CLAUDE.md` §5 and in `apps/backend/src/modules/appointment/domain/appointment-state-machine.ts`.
11. **Data hooks must return referentially stable values.** Any object/array derived from a query payload (spread, `.map()`, adapter mapping) MUST be wrapped in `useMemo` keyed on the raw query data. An unmemoized derived return caused a production freeze on web — an infinite render loop via a consumer's `useEffect(..., [entity])` effect that starved React Router updates (PR #961). Add future payload transforms inside the existing memo, never outside it.

Key documentation:

- `docs/design-system.md` – tokens, primitives, form pattern, anti-patterns, `check:ds`
