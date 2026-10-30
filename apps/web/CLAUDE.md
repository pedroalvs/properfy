# Frontend Web (React + Vite) – Guidance for Claude Code

You are working inside **`apps/web/`** of the Properfy monorepo.

The web frontend implements three portals:

1. **Portal Master Admin** – Platform-wide management (tenants, inspectors, financial, reports)
2. **Portal Imobiliaria/Cliente** – Agency operations (appointments, properties, service groups)
3. **Portal Inquilino** – Tenant confirmation/rescheduling (via unique link, public access)

The frontend is an **evolution of the legacy UI system** (Vue 2 + Vuetify 2), not a free redesign. You must preserve the visual identity and patterns while modernizing the implementation.

---

## 1. Tech stack

- **Build tool:** Vite 5
- **Framework:** React 18 + React Router 6 (data router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 3
- **Font:** Nunito (Google Fonts)
- **Icons:** Material Design Icons (`@mdi/font`)
- **Maps:** Mapbox (mapbox-gl 3)
- **HTTP client:** `openapi-fetch` typed by `paths` from `@properfy/shared`
- **State:** TanStack Query 5 + local component state
- **Shared standards:** `@properfy/frontend-standards` (`cn()`, constants, ESLint config)
- **Tests:** Vitest (unit/component) + Playwright E2E (`tests/e2e`, Chromium only, every API call stubbed; a CI gate — `test-web-e2e`)

Do **not** change the stack unless explicitly instructed.

---

## 2. Development commands

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Run E2E tests
pnpm test:e2e

# Lint
pnpm lint

# Typecheck
pnpm typecheck

# Regenerate OpenAPI spec + typed client (run from the repo root)
pnpm generate:api
```

---

## 3. Project structure

```text
apps/web/
├── src/
│   ├── app/                    # Router (router.tsx), AuthGuard, ProtectedRoute, ErrorBoundary, QueryProvider
│   ├── components/
│   │   ├── shell/              # AppShell, Sidebar, SidebarItem, SidebarSubmenu, SidebarUser(Menu), MobileDrawer
│   │   ├── ui/                 # Design system primitives (Button, Dialog, ConfirmDialog, DrawerPanel, StatusChip, Tooltip, …)
│   │   ├── forms/              # TextInput, SelectInput, DateInput, PhoneInput, AddressLookupInput, FormField, …
│   │   ├── data/               # DataTable, RowActions, EntityListCard, TableSwitch, DetailRow
│   │   ├── filters/            # FilterBar, FilterInput, FilterSelect, FilterMultiSelect, FilterSegmented, FilterDateRange, FilterTimeRange, FilterBoolean
│   │   ├── feedback/           # Snackbar, EmptyState, ErrorState, LoadingState, InfoBanner, NoPermissionState, FilterRequiredState, OfflineBanner
│   │   ├── import/             # ImportWizard steps
│   │   ├── layout/             # PageHeader, PageSectionHeader, TabsNav, FloatingTotalBar, templates
│   │   └── map/                # MapScreenLayout, MapContainer, MapMarker, MapFloatingAction, MapLassoSelect, …
│   ├── features/               # one folder per domain: analytics, appointments, apps, audit-logs, auth, availability-slots,
│   │                           # contacts, dashboard, financial, inspector-workload, inspectors, integrations, marketplace,
│   │                           # notification-consents, notification-templates, pricing-rules, properties, rental-tenant-portal,
│   │                           # reports, service-groups, service-regions, service-types, settings, tenants, users
│   ├── services/               # api.ts — the single openapi-fetch client
│   ├── hooks/                  # useAuth, useApiQuery, useUrlFilters, useGoBack, usePermissions, useSnackbar, …
│   ├── lib/                    # Helpers (format-date, status-colors, permissions, phone-mask, …)
│   ├── config/                 # env
│   ├── styles/
│   ├── test-utils/
│   └── main.tsx
└── ...
```

**Guidelines:**

- **Shell components** are generic and reusable.
- **Features** group pages, specific components and hooks by domain.
- **API access** goes through `services/api.ts` (typed by `@properfy/shared` `paths`) and `hooks/useApiQuery.ts` – do not create another HTTP client.
- Avoid putting business logic directly in page components.
- Use components from `packages/shared` for shared types and enums.

---

## 4. Design tokens (mandatory)

### Colors

```css
--color-primary: #009DD9;        /* Links, inputs focus, active icons */
--color-secondary: #21566E;      /* Page titles, active tabs, sidebar indicators */
--color-accent: #41A69D;         /* Teal elements */
--color-error: #FF5252;          /* Delete buttons, errors */
--color-info: #00CAE3;           /* Informational */
--color-success: #4CAF50;        /* True booleans, success */
--color-warning: #FB8C00;        /* Pending status */
--color-realty: #215676;         /* Sidebar active, secondary titles */
--color-real-estate: #F37A76;    /* CTA buttons (coral), tab slider, action buttons */
--color-app-bg: #F5F5F5;        /* Main background */
--color-card-bg: #FFFFFF;       /* Card backgrounds */
--color-text-primary: rgba(0,0,0,0.87);
--color-text-secondary: rgba(0,0,0,0.6);
--color-text-muted: rgb(158,158,158);
--color-text-disabled: rgba(0,0,0,0.38);
```

### Typography

- Font: `Nunito` (400, 500, 600, 700)
- Body: `16px`, `500`, `line-height: 24px`, `letter-spacing: 0.5px`
- Page title: `24px`, `700`, `#21566E` (mobile: `20px`)
- Dialog title: `20px`, `500`
- Table header: `14px`, `700`, `rgba(0,0,0,0.6)`
- Table body: `14px`, `400`
- Tabs: `14px`, `700`

### Spacing & radius

- Page padding: `24px` vertical, `32px` horizontal
- Default radius: `4px` (modals/submenus may use `6px` or `8px`)
- Sidebar width: `75px` (fixed)

---

## 5. Status visual map (mandatory, centralized)

| Status | Background | Text |
|---|---|---|
| `DRAFT` | `purple lighten-4` (#E1BEE7) | Dark |
| `AWAITING_INSPECTOR` / `OPEN` | `orange lighten-4` (#FFE0B2) | Dark |
| `SCHEDULED` | `light-blue lighten-4` (#B3E5FC) | Dark |
| `DONE` | `green lighten-4` (#C8E6C9) | Dark |
| `CANCELLED` | `red lighten-4` (#FFCDD2) | Dark |
| `REJECTED` | `deep-orange lighten-4` | Dark |

**Rules:**

- `StatusChip` must use a centralized lookup – no local status mapping per page.
- All 6 statuses must be in the design system.

---

## 6. Layout rules

### Shell

1. Fixed sidebar left (`75px`)
2. Main area with background `#F5F5F5`
3. Page padding: `24px` vertical, `32px` horizontal
4. Map views: sidebar background matches canvas gray

### Page structure

1. `PageHeader` (title + CTA)
2. `FilterBar` (optional)
3. `ContentCard` or `DataTableCard`
4. Loading / empty / error states (always present)

### Page templates

1. **List with filters + table** – most common
2. **Tabs + content**
3. **Direct table** (no filters)
4. **Fullscreen map with side panel**
5. **Grouped list by period/section**

---

## 7. Component rules

### Page header

- Title left-aligned, CTA right-aligned
- CTA always coral (`#F37A76`)

### Back navigation

- **Every web sub-screen has a Back button** in the top-left of its header: icon + visible text "Back" (`aria-label="Back"`), via the shared `BackButton` (or `PageHeader`'s `backTo` prop), which calls `useGoBack(parentPath)` (`hooks/useGoBack.ts`): previous in-app screen when history exists, otherwise the parent screen (first history entry: `history.state.idx === 0`, kept by `replace`, e.g. a fresh tab, a direct link or a login redirect).
- A sub-screen is any screen that is not a sidebar destination: detail, create, import and settings sub-pages. Top-level screens (sidebar items, including Analytics and Workload) have no Back button. `/notification-consents` and redirect-only routes are out of scope.
- `backTo` must be a route every role of the sub-screen can open; otherwise compute it per role. Test the direct-entry fallback with the most restricted role that opens the screen.
- Screens with unsaved changes pass `onBack(goBack)` to show the discard confirmation instead of navigating; the override receives the button's `goBack` and calls it after the user confirms. The page's own `useGoBack` and `backTo` use the same fallback constant.
- Wizard "previous step" buttons are labelled **"Previous step"**, never "Back", so they never share the header button's accessible name.
- The override contract is `onClick?: (goBack) => void` on `BackButton` and `onBack?: (goBack) => void` on `PageHeader`; the page may open a discard dialog, ignore the click (e.g. while a commit runs), or call the received `goBack`. `useGoBack` lives in `BackButton`, so `PageHeader` without `backTo` renders no Back button and calls no router hook (it still works outside a router).

### Filters

- Compact visual, custom style (not generic Tailwind inputs)
- Search with `mdi-magnify` icon
- Filters use border via shadow + custom label (replicating legacy)
- Boolean filters: white container with light border, `4px` radius
- Responsive grid: `lg`/`md`/`sm` breakpoints
- **`FilterInput` is the only debounced search primitive** (300 ms default, `debounceMs`
  prop, magnify icon, floating label, clear button). Reuse it for every search box —
  there is no `useDebouncedSearch` hook and no `SearchInput` in `components/ui/`; do not
  hand-roll another debounce.
- `FilterInput` fires the **latest** `onChange`, not the one captured at keystroke time, so
  consumers can safely spread render-time state (`onChange={(v) => onFiltersChange({ ...filters, search: v })}`).
  Before this was fixed centrally, a sibling filter changed inside the debounce window was
  silently reverted. Preserve that contract if you touch the component.

### Tables

- White background, no heavy shadow
- Header: light visual, strong typography
- Row actions: small icons. Delete never primary visual action
- Status chips standardized via `StatusChip`
- `TableSwitch` for extra columns (opt-in per page, not global)
- Boolean columns use `BooleanIcon` (`mdi-check-bold` true, `mdi-close-thick` false)

### Tabs

- Active: `#21566E`, `700`
- Inactive: `#999999`, `700`
- Slider: `#F37A76` (coral)

### Dialogs

- Simple, functional title
- Primary action: coral
- Secondary: gray
- Close via `X` when appropriate

### Sidebar

- Compact vertical navigation with icons
- Active item: left indicator bar (`4px`)
- Floating submenu with glassmorphism (blur + semi-transparent)
- User section fixed at bottom
- Map views: sidebar background changes to `#F5F5F5`
- **Panel screens live in the `Dashboard` sidebar group** (`NAV_ITEMS` in `components/shell/Sidebar.tsx`): Overview (`/dashboard`), Analytics (`/analytics`), Workload (`/inspector-workload`), plus any new panel screen (e.g. Phase 2 "Live Day"). Children follow one canonical order (operations first, then analysis): Overview · Live Day · Inspector notices · Analytics · Workload · Inspector performance · Goals & rewards. A PR that adds a child inserts it at its position in this order (between the children that already exist), never as a placeholder; menu tests assert presence and relative order by label, never by index or count. Each child's `roles` must mirror the route's `AuthGuard` exactly. The group collapses to a plain "Dashboard" item when the user can see only one child (`collapseIfSingle`, used by this group only). Panel screens are top-level: no Back button, no cross-navigation buttons in their headers. `NAV_ITEMS` and `filterNavItems` are exported from `Sidebar.tsx` (the latter's `clUserPermissions` argument is optional); menu tests render the real `SidebarSubmenu`/`SidebarItem` (no mocks).

### Drawers

- `480px` for simple context / user details
- `970px` for complex operational context
- Overlays content (no resize)

### Snackbar

- Top-right for global errors
- Error variant in dark red
- Multiline support
- Production: friendly message + `request_id` (no raw JSON)
- Dev/staging: expandable technical details

---

## 8. Global states (mandatory on every data screen)

1. **Loading initial:** skeleton or placeholder (not spinner alone in large areas)
2. **Loading action:** button processing state, prevent double-click
3. **Recoverable error:** banner/card/snackbar with retry action
4. **Empty state:** differentiate "no data yet" vs "no results for filter" vs "prerequisite not met"
5. **No permission:** clear message without exposing disabled actions
6. **Filter required:** contextual message like "Apply a filter..."

---

## 9. Responsiveness

### Desktop

- Primary experience
- Fixed sidebar, full tables, inline filters
- Filter grid prioritizes wide distribution on `lg`

### Tablet

- Filters may break into two rows
- Sidebar may collapse to drawer
- Wide tables scroll horizontally

### Mobile

- Sidebar becomes drawer
- Stacked filters
- Tables may become responsive cards
- Dialogs respect viewport
- Title reduces to `20px`

---

## 10. Accessibility (minimum mandatory)

1. Acceptable contrast on text and buttons
2. Visible focus on interactive controls
3. Labels and placeholders do not replace semantic description
4. Action icons must have `aria-label`
5. Dialog must manage focus
6. Disabled states cannot depend only on color
7. **Every custom widget must be fully operable by keyboard.** An ARIA role is a
   promise about behaviour, not a label: declaring `role="listbox"`/`"option"`/
   `"combobox"`/`"tab"` obliges the widget to implement that pattern's keys. This
   was missed for a long time because a `<li onClick>` looks finished on screen
   and lint cannot catch it: `eslint-plugin-jsx-a11y` (recommended,
   `--max-warnings 0`) checks markup, not keyboard behaviour, and there is no
   `axe` run — only tests will.
   - **Listbox / combobox** (`FilterSelect`, `FilterMultiSelect`,
     `AddressLookupInput`, `SelectInput`, `ContactAutocomplete`): options are `<li>`
     and cannot hold focus, so focus stays on the trigger/input and the active
     option travels via `aria-activedescendant` — never `tabIndex={0}` per option,
     which turns one control into N tab stops. ArrowUp/Down move and stop at the
     ends, Home/End jump, Enter selects (multi-select toggles without closing),
     Escape closes, Tab closes rather than stranding the menu open.
   - **Tabs** (`FilterSegmented`): roving tabindex — only the selected tab is in
     the tab order — and arrow keys move between tabs, wrapping around.
   - `Escape` **must** `stopPropagation()`. `Dialog` and `DrawerPanel` close on
     Escape from a document listener, so a bubbling Escape dismisses the whole
     modal and discards whatever the operator had filled in.
   - The keyboard-active option must be visually distinct from the selected one
     (`filterOptionHighlighted` vs `filterOptionActive`). If they render alike, a
     user arrowing past the selected row cannot tell where they are (WCAG 2.4.7).
   - Rows that are not choices ("No options", "Searching…") take
     `role="presentation"` + `aria-live`, never `role="option"`, and must never be
     reachable by the active index.

   `SelectInput.tsx` and `ContactAutocomplete.tsx` are the reference
   implementations — port them rather than inventing a new one.

---

## 11. Implementation order

All foundation phases (tokens → shell → primitives → filters → data → layout → map → domain components) are shipped. New pages compose the existing components; add a new primitive only when no existing one fits, and put it in `components/`, not in the feature.

---

## 12. Decisions already closed

1. **Board/Kanban:** now IN SCOPE and **shipped** — explicitly requested by the client (see `escopo-pendencias-execucao.md` item 09, "Service Dashboard" in the client scope doc §4.3). Column-per-status board for AM/OP at `/appointments/board`, reachable from the "Board" action on the appointments list.
   - **Columns:** `AWAITING_INSPECTOR`, `SCHEDULED`, `REJECTED`, `CANCELLED`, `DONE` — exactly the five in the client doc. `DRAFT` is deliberately excluded and the board shows a notice pointing at the list view.
   - **No drag & drop.** The client doc never asked for it, and the moves that matter are not raw transitions anyway (`AWAITING_INSPECTOR → SCHEDULED` requires assigning an inspector; cancel/reject require a reason). Cards change status through the same dialogs as everywhere else, so the state machine keeps a single enforcement path. Do not add DnD without re-deciding this.
   - **Filters are shared with the list**, not re-implemented: both screens read `APPOINTMENT_FILTER_SCHEMA` (`features/appointments/hooks/useAppointmentList.ts`) through `useUrlFilters`, which is what makes filters survive the List ⇄ Board jump. The board hides `status` (its column axis) and `showCancelled` via `AppointmentFilters`' `hiddenFilters` prop.
   - **One query per column** (`useAppointmentBoard`), so each column gets its own true total and its own "Load more". They share the `['appointments']` query-key prefix, so existing mutations that invalidate it refresh the board for free.
   - **`overdueOnly` caveat:** overdue is an **age-of-record** rule — `status IN OVERDUE_ELIGIBLE_STATUSES (DRAFT, AWAITING_INSPECTOR, SCHEDULED)` AND `created_at` older than `OVERDUE_AGE_DAYS` (45). The scheduled date plays no part, so a future-dated appointment that has been stalled for months **is** overdue. Server-side the filter *intersects* with the status filter (it does not replace it), so a terminal column correctly comes back empty; the board skips those queries as an optimisation rather than a correction. `DRAFT` is overdue-eligible server-side but is not a board column, so `OVERDUE_BOARD_COLUMNS` in `useAppointmentBoard` derives the enabled set from the shared constant instead of restating it.
2. **SVG assets:** Do not reuse legacy branding. Only neutral/functional icons validated for Properfy.
3. **TableSwitch:** Opt-in per page, not global.
4. **Snackbar:** No raw JSON in production.
5. **Status map:** `DONE` and `REJECTED` are mandatory in the design system.
6. **Existing dashboard screens are frozen (Phase 2 rule, 2026-10-27).** Do not change `DashboardPage` (`/dashboard`), `AnalyticsPage` (`/analytics`) or `InspectorWorkloadPage` (`/inspector-workload`): cards, charts, filters, `WeekSelector`, `IntegrationWarnings` and the "New Appointment" action stay as they are. If a task seems to need a change there, **stop and ask the developer explicitly**. A new requirement goes into a **new screen**. The only authorized change is X01's removal of the cross-navigation buttons from those three headers.
7. **Geocoding coordinates are never posted from forms (X02-1).** The branch form (`useBranchSave`) never sends `latitude`/`longitude`; the property create form keeps the coordinate fields `''`. In the property **edit** form (`usePropertySave` / `PropertyFormDrawer`), coordinates are posted only when a parsed value differs from the loaded value; clearing both fields sends `latitude:null, longitude:null` **only** for a `MANUAL` property (unlock → re-geocode), and an incomplete pair is never sent. Selecting an autocomplete suggestion in edit mode clears the coordinate fields only when the property is `MANUAL`. The backend geocodes addresses in permanent mode; the geocoding status badge shows `FAILED` when the account rejects permanent geocoding.
8. **Map period window (F00).** `/map` opens pre-filtered to a default date window `today .. today + N` (civil dates in the agency timezone). The window machinery lives in `useMapPeriodWindow` (`features/appointments/hooks`), which owns both filter states and gates the first `/v1/appointments` request on `appointmentWindowReady` so it never fires unbounded (the panel header shows `Loading…` until ready). `N` and the timezone come from the **filtered agency** (AM/OP: the Agencies filter; CL: the user's own agency) read via `useTenantAdminDetail(agencyId, { retry: false })` — its per-agency `mapWindowDays` (default 14) and `tenants.timezone`; **never `user.timezone`**. Groups mode is always 14/Sydney. Pure helpers (`computeWindowRange`, `clampRangeToWindow`, `resolveMapWindowDays`, `resolveWindowTimezone`, `formatWindowLabel`) are in `features/appointments/lib/map-period-window.ts`. The active window is shown by `MapWindowChip` (`components/map`), both above the Date Range in the panel and beside `MapFilterToggleButton` when the panel is closed: **AM/OP get a removable chip** (✕ clears the window; manual date edits turn it off); **CL gets a static chip** and their date inputs are clamped to the window via `FilterDateRange`'s `min`/`max`/`helperText`. Switching the agency re-applies the window **while it is active** (an AM/OP removal stays removed across an agency switch).
9. **Inspector base address (F01-1).** The inspector create/edit drawer (`InspectorFormDrawer` + `useInspectorSave`) has a "Base Address" section (structured AU fields; state is a `SelectInput` over `AU_STATES`; country is always `'AU'` and not a form field). It is **required on create** (validated client-side) and **changeable but not removable** on edit (omitted = keep; the backend rejects `address:null`). Coordinates are never posted — the backend geocodes in permanent mode. The form only reads/writes `address`; `baseLat/baseLng` and app-adoption fields are not shown here (F01-2 adds the App/Push/Last-seen columns + adoption section). CL_* never receive `address` from the API.
10. **Inspector app adoption + base-location display (F01-2).** The inspectors **table** (`InspectorTable`) has three columns after Status — **App** ("Installed"/"—"), **Push** ("On"/"Off"/"—") and **Last seen** (relative text) — all client-side sortable with nulls last, plus a warning **"No base address"** badge beside the name when `baseLat` is null (tooltip "Missing base address" when `address` is null, else "Address could not be located", decided from the list `address` for AM/OP, no per-row GET). `InspectorFilters` has a **"No base address"** toggle → `missingBaseAddress=true` (`useInspectorList`); the filter's empty state is "No inspectors without a base address." The **detail** (`InspectorDetailSections`) has a read-only **"Base Address"** section ("Located · Updated {date}" / "Could not be located" / "Not set") and an **"App Adoption"** section (Installed / Push / Last seen / App version, with a "Last device seen" caption; fallbacks for a never-opened app). Last-seen absolute tooltips and base/app dates render in `PLATFORM_TIMEZONE` (Sydney) regardless of the browser via `formatLastSeen*` in `features/inspectors/lib/adoption-format.ts`; relative "N h ago"/"Just now"/"Never" is computed there too. Raw coordinates are never rendered. F01-2 does **not** touch the drawer, `useInspectorSave`, or `lib/address.ts` (the drawer is F01-1's).

---

## 13. Conventions for Claude Code

When you (Claude Code) implement or modify frontend code:

1. **Read this file and the existing components first** – `components/` is the design system; the visual spec lives in this file (§4–§10).
2. **Do not redesign freely** – preserve the visual language of the legacy system.
3. **Use design tokens** – no hardcoded colors without justification.
4. **Reuse base components** before creating page-specific variations.
5. **Implement all states** – loading, empty, error, permission on every data screen.
6. **Respect responsiveness** – desktop-first but tablet/mobile must not look improvised.
7. **Language: English** for all user-facing text (labels, messages, placeholders). Mock/seed data may retain Portuguese names.
8. **Types from `packages/shared`** for enums, IDs and shared schemas.
9. **If a rule is still open**, declare the assumption explicitly in your output.
10. **The frontend must NOT look like a generic Tailwind template.**
11. **Data hooks must return referentially stable values.** Any object/array derived from a query payload (spread, `.map()`, normalization) MUST be wrapped in `useMemo` keyed on the raw query data. An unmemoized derived return caused a production freeze — an infinite render loop via a consumer's `useEffect(..., [entity])` populate effect that starved React Router updates (PR #961). Add future payload transforms inside the existing memo, never outside it.
12. **Never render inspector GPS coordinates for `CL_ADMIN`/`CL_USER`** (root `CLAUDE.md` §7.9). Show distance, accuracy and flags; coordinates are `AM`/`OP` only.
