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
- **Tests:** Vitest (unit/component). Playwright E2E (`tests/e2e`, 4 mobile/tablet projects) exists but is **broken (56/56 failing) and not in CI** until X03 restores it.

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
```

---

## 3. Project structure

```text
apps/pwa/
├── src/
│   ├── app/                    # App shell wiring: router, providers, SW registration
│   ├── components/
│   │   ├── shell/              # PwaLayout (app frame), BottomNavBar, TopBar, TwoPaneLayout + WidePaneContext (wide master-detail)
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

---

## 5. PWA configuration

### Service Worker

- Strategy: `generateSW` (Workbox auto-generated)
- Register type: **`autoUpdate`** — new versions activate automatically on next load (no update prompt)

### Caching

- **Static assets:** precached at build (JS, CSS, HTML, images, fonts); Google Fonts CacheFirst
- **API requests** (`vite.config.ts` `runtimeCaching`):
  - `/v1/inspector/schedule*` → NetworkFirst, `api-schedule-cache` (24 h, 50 entries, 10 s network timeout; no `cacheableResponse` today: Workbox default `0`/`200`)
  - `/v1/inspector/appointments/*` → NetworkFirst, `api-appointment-cache` (5 min, 100 entries; no `cacheableResponse` today: Workbox default `0`/`200`)
  - `/v1/marketplace/offers` → NetworkOnly (offers are never served stale)
- **In memory:** TanStack Query `networkMode: 'offlineFirst'`, `gcTime` 24 h (`QueryProvider.tsx`)
- **Logout wipes inspector data:** every API cache name is listed in `INSPECTOR_API_CACHES` (`hooks/useAuth.tsx`) and deleted on logout together with the offline queue, so a shared device never shows the previous inspector's data. A new inspector cache MUST be added to that list.
- **Today's work must stay readable offline.** Any inspector read endpoint that the day depends on (today's schedule, appointment detail and, from F04, the day plan `GET /v1/inspector/day-plans/:date` in `api-day-plan-cache`) uses NetworkFirst with a 10 s network timeout, like the existing caches. **Required for every new inspector cache** (the two existing caches do not set `cacheableResponse` today): `cacheableResponse: { statuses: [200] }` (an error such as "not published" is never cached as data), `maxAgeSeconds` ≤ 12 h and `maxEntries` ≤ 10 unless the task says otherwise, its cache name added to `INSPECTOR_API_CACHES`, and the fixed offline copy in the UI: "Offline · showing your last saved <thing>" with cache, "You're offline. Connect to load <thing>." + Retry without. Write actions keep using the offline queue; new write actions require a connection unless their task says otherwise. Downloads (e.g. the route sheet) and AM/OP routes are never cached.

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

- **Unit/component tests** (Vitest): hooks, helpers, business logic, components
- **E2E** (Playwright, `tests/e2e`, mobile/tablet projects, API mocked with `page.route`): **currently broken — every spec fails on a clean `develop` (56/56) and the suite is not run by CI.** Do not cite it as verification. X03 (`fase2-etapa1/X03-e2e-pwa.md`) restores it before F04-3b; until then prove PWA behaviour with Vitest component tests and a manual browser check.
- Mock geolocation and camera APIs in tests
- Test offline scenarios

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
