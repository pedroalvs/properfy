# PWA Inspector App – Guidance for Claude Code

You are working inside **`apps/pwa/`** of the Properfy monorepo.

The PWA is a **mobile-first Progressive Web App** for property inspectors in the field. It provides the tools for inspectors to manage their schedule, accept marketplace offers, execute inspections with geolocation evidence, and track their earnings.

---

## 1. Tech stack

- **Build tool:** Vite (with `vite-plugin-pwa` + Workbox)
- **Framework:** React
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Font:** Nunito (shared with web)
- **Icons:** Material Design Icons (`@mdi/font`)
- **Maps:** Mapbox (route visualization, property location)
- **Geolocation:** Browser Geolocation API
- **HTTP client:** OpenAPI-generated client (same contracts as web)
- **State:** React Query + local state
- **Offline:** Service Worker with Workbox (cache-first for static, network-first for API)
- **Tests:** Vitest (unit) + Playwright (E2E mobile viewport)

Do **not** change the stack unless explicitly instructed.

---

## 2. Development commands

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build for production (generates SW)
pnpm build

# Preview production build
pnpm preview

# Run tests
pnpm test

# Lint
pnpm lint

# Typecheck
pnpm typecheck
```

---

## 3. Project structure

```text
apps/pwa/
├── src/
│   ├── app/                    # App shell, routing, providers, SW registration
│   ├── components/
│   │   ├── shell/              # MobileShell, BottomNav, TopBar
│   │   ├── ui/                 # Shared primitives (buttons, chips, cards, inputs)
│   │   ├── feedback/           # Snackbar, EmptyState, LoadingState, ErrorState
│   │   └── map/                # MapView, PropertyMarker, RouteOverlay
│   ├── features/
│   │   ├── auth/               # Login, session
│   │   ├── offers/             # Marketplace offers list, accept flow
│   │   ├── schedule/           # Daily schedule, appointment list
│   │   ├── execution/          # Start/finish inspection, checklist, evidence upload
│   │   ├── appointments/       # Appointment details, contact info, restrictions
│   │   └── earnings/           # Financial summary, inspector invoice history
│   ├── services/               # API clients (generated from OpenAPI)
│   ├── hooks/                  # Shared hooks (useGeolocation, useOnlineStatus, useAuth, etc.)
│   ├── lib/                    # Helpers (formatCurrency, formatDate, distance, etc.)
│   ├── types/                  # DTOs (from packages/shared)
│   └── main.tsx
├── public/
│   ├── manifest.json
│   └── icons/                  # PWA icons (192, 512, apple-touch)
└── ...
```

---

## 4. Core features

### 4.1 Marketplace offers

- `GET /v1/inspector/offers` – List available service group offers
- Display grouped inspections by date/region
- **Accept flow:** `POST /v1/marketplace/offers/:groupId/accept` with `Idempotency-Key`
- First valid acceptance wins (concurrent accept handled by backend)
- Show offer details: date, time window, region, service count, payout estimate

### 4.2 Daily schedule

- `GET /v1/inspector/schedule?date=YYYY-MM-DD` – List day's appointments
- Display as timeline or list sorted by time slot
- Show: property address, service type, time, tenant confirmation status
- Map view with route visualization
- **T-1 rule filtering:**
  - `Routine Inspection`: only show if tenant confirmed (or exception applies)
  - `Ingoing/Outgoing`: show when `SCHEDULED`
  - Exceptions: `key_required = true`, manual OP confirmation

### 4.3 Inspection execution

**Start inspection:**

- `POST /v1/inspector/appointments/:appointmentId/start`
- Capture: `latitude`, `longitude` (Geolocation API)
- Validate geolocation is within acceptable radius of property

**Finish inspection:**

- `POST /v1/inspector/appointments/:appointmentId/finish`
- Capture: `latitude`, `longitude`, `checklist` (JSON), `notes`, `assets` (photos/files)
- Evidence upload via signed URLs (Supabase Storage)
- Checklist completion validation before allowing finish

**Execution flow:** `SCHEDULED → start (capture geo) → execute checklist → upload evidence → finish (capture geo) → DONE`

### 4.4 Appointment details

- `GET /v1/inspector/appointments/:appointmentId`
- Show: property info, contact details, restrictions, meeting location, key info
- Navigation to property on map
- Contact tenant directly (phone/SMS link)

### 4.5 Earnings

- Financial summary (current period)
- Inspector invoice history
- Per-appointment payout details

---

## 5. PWA configuration

### Service Worker

- Strategy: `generateSW` (Workbox auto-generated)
- Register type: `prompt` (show update notification)

### Caching

- **Static assets:** Precached during build (JS, CSS, HTML, images, fonts)
- **Google Fonts:** CacheFirst (1 year)
- **API requests:** NetworkFirst with fallback cache (5 min)
- **Critical data:** Schedule for today should be aggressively cached for offline viewing

### Manifest

- Display: `standalone`
- Orientation: `portrait`
- Theme color: aligned with Properfy brand

### Update prompt

- Show toast notification when new version available
- Allow immediate update or dismiss

---

## 6. Mobile-first design rules

### Navigation

- **Bottom navigation bar** with: Schedule, Offers, Map, Earnings, Profile
- **Top bar** with: date selector (for schedule), notification bell, connection status indicator
- No sidebar (mobile-first)

### Layout

- Full-width cards
- Large touch targets (min 44px)
- Swipe gestures where appropriate (e.g., swipe to next appointment)
- Pull-to-refresh on list views

### Visual tokens (shared with web)

- Same color palette (`--color-primary`, `--color-real-estate`, etc.)
- Same font (Nunito)
- Same status chip colors
- Adapted spacing for mobile (tighter padding, smaller text where needed)

### Offline behavior

- Show connection status indicator (online/offline)
- Allow viewing cached schedule when offline
- Queue actions when offline, sync when back online
- Show clear feedback: "You are offline. Changes will sync when connected."

---

## 7. Geolocation

- Use Browser Geolocation API (`navigator.geolocation`)
- Request permission on first use with explanation
- Handle permission denied gracefully
- Capture coordinates at inspection start and finish
- Validate proximity to property location (backend validates too, but show warning in app)
- Show map with property location and inspector position

---

## 8. Evidence upload

- Photos: camera capture or gallery selection
- Files: PDF or image upload
- Upload via signed URLs to Supabase Storage
- Show upload progress
- Retry on failure
- Validate minimum evidence before allowing inspection finish
- Compress images before upload (reduce bandwidth)

---

## 9. Global states

Every screen must handle:

1. **Loading:** Skeleton placeholders (not spinner alone)
2. **Error:** Friendly message with retry
3. **Empty:** "No appointments for today" / "No offers available"
4. **Offline:** Cached data with offline indicator
5. **Permission denied:** Geolocation or camera permission explanation

---

## 10. Testing

- **Unit tests** (Vitest): hooks, helpers, business logic
- **E2E** (Playwright with mobile viewport): execution flow, accept offer, schedule view
- Mock geolocation and camera APIs in tests
- Test offline scenarios

---

## 11. Conventions for Claude Code

When you (Claude Code) implement or modify PWA code:

1. **Mobile-first always** – design for phone screen first, then adapt up.
2. **Respect the execution flow** – `SCHEDULED → start → checklist → evidence → finish → DONE`.
3. **Geolocation is critical** – always handle permission, errors and fallbacks.
4. **Offline support** – cached schedule, queued actions, clear feedback.
5. **Share types from `packages/shared`** for enums, IDs and DTOs.
6. **Same visual tokens** as web (colors, typography, status chips).
7. **Language: pt-BR** for all user-facing text.
8. **Performance matters** – compress images, lazy load, minimize bundle.
9. **Touch-friendly** – large targets, no hover-dependent interactions.
10. **Consult `projeto-consolidado/`** for complete business rules, especially state machine and T-1 rules.

Key documentation:

- `projeto-consolidado/state-machine-executavel.md` – state transitions and T-1 rules
- `projeto-consolidado/api-contratos-principais.md` – Inspector App API section
- `projeto-consolidado/regras-negocio-respostas-cliente.md` – execution rules, confirmation, rescheduling
