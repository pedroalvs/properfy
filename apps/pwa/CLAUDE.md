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
- **Maps:** Mapbox (`mapbox-gl`) for the offers map
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

There is **no** `components/map/` directory and **no** `features/appointments/` feature: the
offers map lives in `features/offers/` and appointment detail lives in `features/schedule/`
(`AppointmentDetailPage.tsx`). The app frame is `PwaLayout` (there is no `MobileShell`).

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

### 4.4 Appointment detail (`features/schedule`, route `/schedule/:appointmentId`)

- `GET /v1/inspector/appointments/:appointmentId`
- Show: property info, contact details, restrictions, meeting location, key info
- Contact tenant directly (phone/SMS link)

### 4.5 Earnings (`features/earnings`, route `/earnings`)

- Financial summary (current period)
- Inspector invoice history (`InvoiceListPage`, `InvoiceDetailPage`) and request flow (`RequestInvoicePage`)
- Per-appointment payout details

### 4.6 Profile (`features/profile`, route `/profile`)

- Tile grid with sub-routes: `/profile/account`, `/profile/availability`, `/profile/documents`, `/profile/settings` (security, 2FA, sessions, install app). `/profile/edit` redirects to `/profile/account`.
- **Base address (F01-3, contract 00.4).** `/profile/account` has an inline "Base address" card (`id="base-address"`) that edits the inspector's base via `PATCH /v1/inspectors/me {address}` (geocoded server-side in permanent mode). It validates with the shared `inspectorBaseAddressSchema` + `AU_STATES` and sends `city = suburb`, `country = 'AU'`, no client coordinates; a saved address that does not parse is legacy-incompatible (fields stay empty with a re-entry prompt, never normalised). `BaseAddressBanner` (`components/feedback/` — shared so the schedule home can mount it without a cross-feature import) is a fixed, non-dismissable prompt shown on `/schedule` and `/profile` while `useInspectorMe().data.baseLat == null` (variant 1 "Add your base address" / variant 2 "We couldn't locate…"); it disappears once a save with coordinates invalidates `['inspector']`. `/v1/inspectors/me` has no response schema, so `useInspectorMe`/`useUpdateInspectorSelf` type the base fields manually; never read the base from `/v1/me` (its schema strips it).
- **App settings (`/profile/settings`).** Content order is a reserved empty `[data-testid="push-preference-slot"]` (F02 fills it, D8) → `InstallAppCard` → a version footer `Properfy Inspector v{__APP_VERSION__}`.
- **App version.** `__APP_VERSION__` is a Vite `define` (`vite.config.ts`, applies to Vitest too) = `buildAppVersion(pkg.version, process.env.APP_BUILD_SHA)` from `apps/pwa/src/lib/app-version.ts` → ``${version}+${sha7}`` (`+dev` locally). CI sets `APP_BUILD_SHA` on the three PWA build steps (`frontend-deploy.yml`); it is read in Node, never `VITE_`-prefixed.
- **App-state heartbeat (F01-3, contract 00.10).** `useAppStateHeartbeat()` (`src/app/`) is called from `PwaLayout`; it POSTs `/v1/inspectors/me/app-state {displayMode, pushPermission, appVersion}` on mount and on `visibilitychange`→visible, throttled to once per 6 h per device via the `localStorage` key `properfy.pwa.appStateHeartbeat` (written only on 204/429). It takes injected `storage`/`send`/`now` for tests; errors are silent. `getIsStandalone()` is exported from `useInstallPrompt.tsx` for it. Logout clears the throttle key in `lib/auth-storage.ts` (`clearTokens`).

---

## 5. PWA configuration

### Service Worker

- Strategy: **`injectManifest`** with a custom `src/sw.ts` (F02-3) — it precaches (`precacheAndRoute(self.__WB_MANIFEST)`), keeps the SPA navigation fallback (`NavigationRoute → index.html`), registers the runtime caches (`src/sw/runtime-caching.ts`, same 5 routes/cache names as before) and adds `push`, `notificationclick` and `pushsubscriptionchange` handlers (pure helpers in `src/sw/push-handlers.ts`, unit-tested). `src/sw.ts`/`src/sw/**` typecheck under `tsconfig.sw.json` (WebWorker lib) and are excluded from the main tsconfig. The push target allowlist is the shared `isAllowedInspectorNoticeTargetPath` (no local normalization). Output stays `dist/sw.js`, so a rollback to `generateSW` swaps the same file.
- Register type: **`autoUpdate`** — new versions activate automatically on next load (`skipWaiting` + `clientsClaim`, no update prompt)

### Caching

- **Static assets:** precached at build (JS, CSS, HTML, images, fonts); Google Fonts CacheFirst
- **API requests** (`vite.config.ts` `runtimeCaching`):
  - `/v1/inspector/schedule*` → NetworkFirst, `api-schedule-cache` (24 h, 50 entries, 10 s network timeout, `cacheableResponse: [200]`)
  - `/v1/inspector/appointments/*` → NetworkFirst, `api-appointment-cache` (5 min, 100 entries, `cacheableResponse: [200]`)
  - `/v1/marketplace/offers` → NetworkOnly (offers are never served stale)
- **In memory:** TanStack Query `networkMode: 'offlineFirst'`, `gcTime` 24 h (`QueryProvider.tsx`)
- **Logout wipes inspector data:** every API cache name is listed in `INSPECTOR_API_CACHES` (`hooks/useAuth.tsx`) and deleted on logout together with the offline queue, so a shared device never shows the previous inspector's data. A new inspector cache MUST be added to that list.
- **Today's work must stay readable offline.** Any inspector read endpoint that the day depends on (today's schedule, appointment detail and, from F04, the day plan `GET /v1/inspector/day-plans/:date` in `api-day-plan-cache`) uses NetworkFirst with a 10 s network timeout, like the existing caches. **Required for every new inspector cache** (the two existing caches now set `cacheableResponse: [200]` too, in `src/sw/runtime-caching.ts`): `cacheableResponse: { statuses: [200] }` (an error such as "not published" is never cached as data), `maxAgeSeconds` ≤ 12 h and `maxEntries` ≤ 10 unless the task says otherwise, its cache name added to `INSPECTOR_API_CACHES` (exported from `hooks/useAuth.tsx`), and the fixed offline copy in the UI: "Offline · showing your last saved <thing>" with cache, "You're offline. Connect to load <thing>." + Retry without. Write actions keep using the offline queue; new write actions require a connection unless their task says otherwise. Downloads (e.g. the route sheet) and AM/OP routes are never cached.

### Manifest

- Display: `standalone`
- Orientation: `portrait`
- Theme color: aligned with Properfy brand

---

## 6. Mobile-first design rules

### Navigation

- **Bottom navigation bar** (`BottomNavBar`) with exactly four tabs:
  - **Schedule** → `/schedule`
  - **Offers** → `/marketplace`
  - **Earnings** → `/earnings`
  - **Profile** → `/profile`
- **Top bar** (`TopBar`) with contextual title/actions and connection status
- No sidebar (mobile-first)

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

## 8. Evidence upload

There is **no evidence or photo upload** in the PWA today: finish is geolocation + timestamp only (§4.3). Attachments are Phase 2 feature F10 (on hold); do not build upload UI outside it.

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

- **Projects:** 4 — `Mobile Safari` (iPhone 13, WebKit), `Mobile Chrome` (Pixel 5), `Tablet (iPad portrait)` (iPad gen 7, WebKit, wide 2-column layout), `Foldable open` (Pixel 5 @ 840×1080, wide). 14 specs × 4 = 56.
- **Prerequisite — build both workspace packages first:** `pnpm --filter @properfy/shared build && pnpm --filter @properfy/frontend-standards build`. `vite dev` resolves both only through `dist/`; without them `App.tsx`'s top-level import 500s and the shell never mounts (this was the original 56/56 failure). The Playwright `globalSetup` fails fast with a build message if a `dist/` is missing (rebuild both after a pull).
- **Server:** the suite starts its own `vite` on strict port **5175** (`PWA_E2E_PORT` to override per worktree), `reuseExistingServer: false` — it never reuses another worktree's / the web dev server. Context is pinned: `timezoneId: 'Australia/Sydney'`, `locale: 'en-AU'`, `serviceWorkers: 'block'`, and `webServer.env` fixes `VITE_API_BASE_URL=http://localhost:3000` + empty `VITE_MAPBOX_TOKEN` (map never initializes → no external request).
- **All API mocked via `tests/e2e/support/api.ts`.** Rules: `blockUnmockedApi(page)` registered **first** (last `page.route` wins); any unstubbed `/v1/**` returns `501 E2E_UNMOCKED` with a `console.warn` (a 501 never fails a test by itself — only a dependent assertion does); the catch-all is scoped to the API origin, **never** the `**/v1/**` glob (it would also catch Mapbox tiles); `/v1/me` is **plain** (no `data` envelope); no `window.fetch` monkey-patch (openapi-fetch captures `fetch` at client creation).
- **Baseline-stub rule:** `loginAsInspector` (tokens via `addInitScript`, never `goto+evaluate`) registers `BASELINE_STUBS` (`tests/e2e/support/auth.ts`): `GET /v1/me` and `POST /v1/inspectors/me/app-state` → 204 (the F01-3 heartbeat, fired from `PwaLayout` on every authenticated mount). `GET /v1/inspectors/me` is a profile-screen query, not a boot call, so it stays OUT of the baseline. **Every feature that adds a new authenticated-boot API call adds its default stub to `BASELINE_STUBS` in the same PR.**
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
