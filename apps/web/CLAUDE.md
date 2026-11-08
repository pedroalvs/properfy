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
│   │                           # contacts, dashboard, financial, inspector-notices, inspector-workload, inspectors, integrations,
│   │                           # marketplace, notification-consents, notification-templates, platform-settings, pricing-rules,
│   │                           # properties, rental-tenant-portal, reports, service-groups, service-regions, service-types, settings, tenants, users
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
10. **Inspector app adoption + base-location display (F01-2).** The inspectors **table** (`InspectorTable`) has three columns after Status — **App** ("Installed"/"—"), **Push** ("On"/"Off"/"—") and **Last seen** (relative text) — all client-side sortable with nulls last, plus a warning **"No base address"** badge beside the name when `baseLat` is null (tooltip "Missing base address" when `address` is null, else "Address could not be located", decided from the list `address` for AM/OP, no per-row GET). `InspectorFilters` has a **"No base address"** toggle → `missingBaseAddress=true` (`useInspectorList`); the filter's empty state is "No inspectors without a base address." The **detail** (`InspectorDetailSections`) has a read-only **"Base Address"** section ("Located · Updated {date}" / "Could not be located" / "Not set") and an **"App Adoption"** section (Installed / Push / Last seen / App version; App version keeps a "Last device seen" caption; fallbacks for a never-opened app). The **Push** field (table and detail) tooltip follows F02's D10 subscription semantics (see §12.11), not a "last device seen" caption. Last-seen absolute tooltips and base/app dates render in `PLATFORM_TIMEZONE` (Sydney) regardless of the browser via `formatLastSeen*` in `features/inspectors/lib/adoption-format.ts`; relative "N h ago"/"Just now"/"Never" is computed there too. Raw coordinates are never rendered. F01-2 does **not** touch the drawer, `useInspectorSave`, or `lib/address.ts` (the drawer is F01-1's).
11b. **Field activity, inspector-unable card, Platform settings (F03-4).** Web consumer of the F03-1/F03-2 contracts already on `develop` (no backend, schema or `api-types.ts` change). The appointment **detail** (`AppointmentDetailPage` overview tab) renders a **"Field activity"** block (`AppointmentFieldActivitySection`, hook `useAppointmentFieldActivity` → `GET /v1/appointments/:id/field-activity`, key `['appointments', id, 'field-activity']` so the `['appointments']` transition invalidation refreshes it) after `AppointmentDetailSections` and before `AppointmentSatisfactionSection`: check-in/out times, distances + accuracy, flag chips (Outside geofence / Outside time window / Checked out outside geofence / Abandoned), device-time note, and the field-events list. **CL privacy cut (root §7.9):** these components never read an inspector coordinate field; a Vitest guard fails if a coordinate reaches the DOM. The reusable **`InspectorIssueCard`** (`full`/`compact` variants, prop `currentInspectorId`, `data-testid` passthrough) shows the last `CANT_DO` (`appointment.inspectorIssue`) at the top of `AppointmentDetailSections` and, compact, in `AppointmentMapDetailPanel` (below the REJECTED banner, which now humanizes the code via `formatReasonCodeLabel`); the compact card opens no modal (map-popup trap). `AuditTimeline` labels `inspection.geolocation_mismatch`/`inspection.check_in_blocked`/`inspector_field_event.cant_do`/`inspector_field_event.late_notice`/`inspection.completion_reminder_sent` and adds "Initiated by inspector" (`metadata.source === TRANSITION_SOURCE_INSPECTOR_CANT_DO`) and "Check-out" (`metadata.phase === 'FINISH'` or `metadata.source === 'INSPECTOR_FINISH'`, inert until F06-2) badges — compare the shared `TRANSITION_SOURCE_*` constants, never `actorType`/literals (except the forward-compat `INSPECTOR_FINISH` literal). `StatusTransitionDialog` removes `SYSTEM_ONLY_REJECTION_CODES` from the REJECTED options as an isolated filter step (so F07-3 can chain `allowedRejectionCodesFrom` before it). New **`features/platform-settings/`**: route `/platform-settings` (`AuthGuard roles={[AM, OP]}`, `PlatformSettingsPage`, Back button discards unsaved changes), one `FormSection` per `PLATFORM_SETTINGS_REGISTRY` key via the generic `usePlatformSetting(key)` hook (`GET`/`PUT /v1/platform-settings/:key`, last-write-wins D18) — this task ships only `FieldEventsSettingsSection` (radius/mode/tolerance/reminder, client validation, 400→field errors+focus, 403 ErrorState, snackbar "Changes apply within a minute."); a future feature adds a key + a section, never touches the hook/page plumbing. Sidebar "Configuration" group gains **"Platform Settings"** (`mdi-tune-vertical`, AM/OP). Portal: `PortalPage` reads `appointment.canChangeTime ?? true` — when false (inspector-rejected, L-F03-01) it hides the change-time picker, skips the available-groups query, and shows "…The agency will contact you to arrange a new time."; `useJoinGroupFlow` reloads the portal on a 409 `PORTAL_APPOINTMENT_INACTIVE` (new `onAppointmentInactive`). Shared format helpers in `features/appointments/lib/field-event-format.ts`.

11. **Inspector notices (F02-2, AM/OP).** `features/inspector-notices/` is the operational-team screen for inspector notices, consuming the F02-1 contract (routes already on `develop`; this feature touches no backend and never regenerates `api-types.ts`). `InspectorNotice`/recipients are **platform-scoped (no `tenant_id`)** — the inspector is cross-tenant — so access is AM/OP-only, enforced by the route `AuthGuard roles={[AM, OP]}` and the Sidebar child's `roles`. Routes: `/inspector-notices` (`InspectorNoticeListPage`) and `/inspector-notices/:noticeId` (`InspectorNoticeDetailPage`, `PageHeader backTo="/inspector-notices"`). The Sidebar "Dashboard" group gains the child **"Inspector notices"** (`mdi-bullhorn-outline`) between Overview and Analytics in the canonical X01 order (see §7 Sidebar). The **New notice** drawer (`NewInspectorNoticeDrawer`) is a controlled form (no react-hook-form in this workspace) whose payload is validated against the shared `publishInspectorNoticeSchema`; it carries a stable `Idempotency-Key` (fresh per open, reused on retry, rotated on success), a critical `ConfirmDialog` that states the SMS-ceiling audience size (`lib/critical-confirm-copy.ts`, Sydney night-window phrase, always `PLATFORM_TIMEZONE`) and the lock-screen hint, and never offers edit/delete (D4 — archive only). The detail shows per-recipient read receipts with "Inactive"/"No app access" muted chips and the "(Z can't read in the app)" tally (L-F02-09), and an idempotent Archive. All civil instants render in `PLATFORM_TIMEZONE` (Sydney), not `user.timezone`. **D10 Push tooltip copy** (owned by F01-2 sites, changed here): On → "Push is on for at least one of the inspector's devices", Off → "No device has push turned on", "—" → "No data yet".
11c. **Service-type duration + Route planning weights & preview (F04-5).** Web (+ shared/backend contract) consumer of the merged F04-1/F04-2/F04-2b/F03-4 contracts. **Service types:** the web `ServiceType` type and `ServiceTypeFormData` gain `defaultDurationMinutes` (number / input string); `ServiceTypeFormDrawer` has a **required** "Estimated duration (min)" `NumberInput` right after "Flow Type" (help text linked by `aria-describedby`; `NumberInput` gained an optional `aria-describedby` passthrough), validated in `useServiceTypeSave` (empty → "Enter the duration in minutes", non-integer → "Enter whole minutes", out of 5–480 → "Enter a duration between 5 and 480 minutes") and sent as a **number** on POST/PATCH; a server 400 with `details[].field` is mapped onto the field (new `SaveResult.fieldErrors` via shared `getFieldErrors`). The shared `createServiceTypeSchema` dropped its transitional `.default(45)` (now required) — backend + shared + web deploy together; `api-types` regenerated. **Platform settings** gains a second section `RouteWeightsSettingsSection` (`usePlatformSetting('routeWeights')`, after "Field events"; three 0–10/one-decimal weights in a `fieldset`/`legend "Route weights"`, group rule "At least one weight must be greater than 0", PUT + snackbar "Route weights saved. They apply to the next route calculation.") with an embedded `RouteWeightsPreview` (`useRouteWeightsPreview` → `POST /v1/day-plans/preview`; two columns "Saved weights" (`current`) / "Weights in this form" (`proposed`), right column flagged "Order changes with these weights"; approximate badge, per-stop "Late by N min"; `429` → "Too many previews. Try again in a minute.", other error → retryable `ErrorState`). The inspector picker is a **feature-local** searchable combobox `InspectorSelect` + `useInspectorSearch` (debounced 300 ms `GET /v1/inspectors?status=ACTIVE&search&pageSize=20`, never `pageSize=100`, ported from `AgencySelect`; added to the `.eslintrc.json` `click-events-have-key-events` allowlist like the other comboboxes) — the shared `SelectInput` is untouched. Dates use `DateInput` min=today / max=today+14 in the **effective timezone** (`useEffectiveTimezone` + `todayInTzDateString`/`addCivilDays`, default tomorrow); a `422 DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` shows "Pick a day between today and 14 days ahead" on the date field. `PlatformSettingsPage` combines both sections' dirty state for the back-guard. **Premise (merged-contract reality):** the preview response exposes no origin/base field, so the task's "No base address" banner is not implemented. `PLATFORM_TIMEZONE`-independent times render 12h am/pm via the shared `formatWallTimeRange`/`formatInstantTime` (not 24h).

12. **Activity density layer (F09-2).** `/map` (Appointments mode only) has an opt-in **"Activity density"** heatmap of inspector check-ins, consuming `GET /v1/map/execution-density` (F09-1 contract; no backend/schema/`api-types` change, no dashboard touched). Pieces: a generic `components/map/DensityLayer.tsx` (fetch-free Mapbox `heatmap` source+layer, renders `null`, **no camera move**), `features/appointments/hooks/useExecutionDensity.ts`, `features/appointments/lib/execution-density-period.ts`, and `features/appointments/components/ExecutionDensityControl.tsx`; `AppointmentMapPage.tsx` only gets ≤ ~12 lines of toolbar wiring. **Custom Mapbox layer pattern on `/map`** (reuse for any future map layer): keep the source/layer in a dedicated component outside the page; **paint colours are comma-form HSL** (`hsla(199, 54%, 28%, a)`) — space-form HSL breaks the whole map (PR #1302), so never feed Tailwind HSL tokens into paint; add the layer with `beforeId` = the first `gl-draw-*` layer so it sits **below** the lasso, and also re-order on `styledata` (`moveLayer` below the first `gl-draw-*`, idempotent — skip when already below, else the `moveLayer → styledata` loop never ends) because the draw control re-adds its layers on top after a style change; **re-apply on `style.load`** from a `ref` of the latest data; clean up (`off` both handlers + remove layer/source) in `try/catch` on unmount (the map may already be `remove()`d via `key={mode}`); memoise `cells` before passing them down (§13.11). The period selector is **independent of the pin "Date Range"** (default last 30 Sydney days; `Custom` AM/OP-only; CL locked to 7/30/90-day presets + one re-anchor on `PERIOD_NOT_A_PRESET`); **Sydney-only by design** (`todayInTzDateString(PLATFORM_TIMEZONE)`, deliberately unlike F00's `resolveWindowTimezone`). "Last N days" is **retrospective and exact** (N civil days ending today), **not** F00's forward `Today + N days` — do not unify the two helpers (L-F00-03). CL privacy (k-anonymity, preset lock) is enforced by the backend; the web discards `tenantId`/`inspectorId` for CL defensively and shows `minCellCount` text from the response (never imports `MIN_CELL_COUNT_CL`). On error the layer empties (`cells: []`) — a failed agency switch must not leave the previous agency's heatmap visible.
14. **Live Day screen (F05-2, AM/OP).** `/live-day` (route `handle: { fullHeight: true }`, `AuthGuard roles={[AM, OP]}`) is the real-time inspector map + list, consuming the merged F05-1 contract and F04 `eta-accuracy` — **no backend/schema/`api-types` change**. Feature `features/live-day/`: `useLiveDay` (`queryKey ['live-day', date, geometryMode, selectedId]`, `refetchInterval` 30 s **only while live** via the shared `isLiveDate(date, data.today)` — today or tomorrow in the **server** frame, L-F05-05 — and only with the tab visible; `keepPreviousData`; D18 geometry mode `none|selected|all` so a poll never carries undrawn geometry), `useEtaAccuracy` (10-min `staleTime`, no poll), `useFrozenOrder` (holds list order while the pointer/focus is in the list, L-F05-08), pure `lib/liveDayView.ts` selectors (`sortInspectors` by `LIVE_DAY_ALERT_TYPE_ORDER` severity then name, `canShowAllRoutes` ≤ `LIVE_DAY_SHOW_ALL_MAX` 40, `stopTimeLabel`), and `lib/stateVisuals.ts` (state → icon + head colour + `LIVE_DAY_STATE_LABELS`). The inspector pin encodes **state** in the head colour + icon, the inspector's own colour only as the `outlineColor` when its route is drawn; the attention flag is a red `badge`. Times render **12h am/pm in the stop's agency timezone** via the shared `formatInstantTime`/`formatWallTime` (F04-5 convention — the task-file's 24h samples are stale); "today", the date-selector max (`addCivilDays(data.today, 1)`) and polling all follow `data.today`, and a deep link beyond tomorrow (400 `LIVE_DAY_DATE_TOO_FAR`) re-anchors to today with a `role="status"` banner. New reusable map primitives in **`components/map/`**: `RouteLayer.tsx` — the web's **first line layer** (two line layers off one geojson source split by each feature's `approximate` flag: `-solid` and `-dashed`; comma-form HSL only in paint — space-form breaks Mapbox, #1302; `beforeId` the first `symbol` layer; idempotent `setData`/`setPaintProperty`/re-add on `style.load`; never calls Directions; takes `map` as a prop like `DensityLayer`); additive `MapMarker` props `headColor`/`outlineColor`/`innerText`/`innerIcon`/`badge`/`ariaLabel`; `MapScreenLayout` gains `storageKey?` (default the `/map` key, so `/map` is unchanged; Live Day uses `'live-day.panel.width'`) and a **collapsible mobile mode below `md`** (bottom sheet, `max-h-[50dvh]`, "Map / List" toggle) which `/map` inherits; `computeMarkerOffsets` moved here from `AppointmentMapPage` (import-only change there). The route geometry is **always an approximate straight line** (F04 Plan B persists none), so every row shows the "Approximate route" chip. "Route infeasible" is an **indicator** on the row (badge + tooltip from `routeViolations`), never an alert — it does not count in "Needs attention" nor change the order (L-F04-05). Sidebar: "Live Day" child in the **Dashboard** group, right after Overview (`mdi-map-clock-outline`, AM/OP). a11y is asserted via explicit ARIA/keyboard invariants in the tests — the web workspace has **no axe engine** and prior web features shipped without one.

15. **Locked time & per-inspector alert limits (F05-3, AM/OP).** Web-only consumer of the merged F05-1 contract — **no backend/schema/`api-types` change**. (a) **"Locked time" tab (01.13)** lives inside the Live Day panel (`features/live-day/`), **not** in `/analytics` and reusing nothing from it or `ConfirmationMeter` (D9/D12). `LiveDayPanel` gains a `TabsNav` ("Inspectors" default / "Locked time"); the active tab is `?tab=locked` (`replace`) owned by `LiveDayPage`; switching tabs never stops the live-day poll or clears the selection, and the map + "Route ETA accuracy" footer stay on both tabs. `useLockedTime(today, period)` → `GET /v1/dashboard/locked-time?from&to`, key `['locked-time', from, to]`, `staleTime` 60 s, **no poll**; the range always anchors on the live-day `data.today` (L-F05-09), independent of the Inspectors date, with presets 7/14/30 (default 14, feature-local constants, unrelated to F00 `mapWindowDays`). `LockedTimeSection` shows an overall `role="meter"` + two client-sortable tables (`lib/lockedTimeView.ts`); "Locked" = the tenant confirmed — counts routine inspections that need tenant confirmation (no key). The region cell is `{regionName} · {agencyName}` / `· Platform` (global) / no suffix for "No region", which is **always last in any sort** (L-F05-13) — a bespoke table, not `DataTable`, because that pin is per-row. Civil range labels use a deterministic, tz-free `formatCivilDayMonth` (English-only, no `Intl` — avoids the Node ICU drift). (b) **Alert limits** follow "platform default + per-field override": the default is the `liveDayAlerts` key in **Platform settings** (`LiveDayAlertsSettingsSection` via `usePlatformSetting`, after "Tenant arrival notices"); the per-inspector override is a **"Live Day alerts"** section in the inspector drawer's Details tab (`InspectorAlertThresholdsSection`, rendered by `InspectorDetailSections`), **AM/OP-only** — self-gated via `useAuth`, its `useInspectorAlertThresholds` hook disabled for CL (no 403). Each field has a "Use platform default (n min)" checkbox (sends `null`); a successful `PUT /v1/inspectors/:id/alert-thresholds` invalidates `['live-day']` so the next poll uses the new limit; Escape cancels via a capture-phase document listener (stops the drawer closing, §10); 404 on save → "This inspector no longer exists.". (c) **Open-inspector path (L-F05-14):** `InspectorListPage` opens the detail drawer from `?open=<uuid>` (non-uuid ignored; close drops the param with `replace`), the drawer gains a 404 "This inspector no longer exists." state, and `LiveDayInspectorDetail` has an "Open inspector" `<Link>` to `/inspectors?open=<id>`. All civil instants render in `PLATFORM_TIMEZONE`.

13. **Tenant arrival notices — foundation web (F06-1, AM/OP).** Consumer of the F06-1 shared+backend contract (`api-types` regenerated for the opt-out route + the `tenantEtaNoticesEnabled` flag). Platform settings gains a third section `TenantEtaNoticesSection` (`usePlatformSetting('tenantEtaNotices')`, after "Route planning"; header from the response `section`): a `role="switch"` enable toggle, Channels/Morning-hour/Cutoff-hour `SelectInput`s, Running-late-threshold + SMS-budget `NumberInput`s, the fixed ±30-min range note, cross-field "Must be after the morning notice hour" + bounds validation, 400→field errors, `PlatformSettingsPage` combines its dirty state for the back-guard. `TenantFormDrawer` Notifications section (AM gate) gains a `tenantEtaNoticesEnabled` checkbox below the rental-tenant switch — read via shared `isTenantEtaNoticesEnabled` (absent = on), sent nested under `settings` in the PATCH, **disabled with a reason** when the rental-tenant switch is off (`TenantAdminFormData.tenantEtaNoticesEnabled`, `serverFieldMapper` maps `settings.tenantEtaNoticesEnabled`). `notification-consents` gains a "Record opt-out" button on `ConsentLookup` (AM/OP) opening `ConsentOptOutModal` (Agency via the shared `AgencySelect`, recipient pre-filled from the search, Channel, Reason; `POST /v1/notifications/consents/opt-out`; submit disabled until agency+recipient+reason; success → snackbar "Opt-out recorded" + lookup refetch). Nothing sends in this task; the triggers are TASK-F06-2.

17. **Inspector performance page & Reliability index settings (F07-3, AM/OP).** `features/inspector-performance/` is the web consumer of the merged F07-1/F07-2 contract — **no backend, schema, migration or `api-types.ts` change** (the routes `GET /v1/dashboard/inspector-performance[/:inspectorId]` and the `reliabilityIndex` platform-settings key already exist). Route `/inspector-performance` (`AuthGuard roles={[AM, OP]}`, lazy) renders the reliability ranking (03.11) + a per-inspector metric **drawer** (03.12) deep-linked by **`?inspector=<id>`** (the page owns the param and **focus restore** to the originating row control — `DrawerPanel` moves focus in on open but does **not** restore it; it also does **not** trap Tab). Reliability data is **platform-scoped (no `tenant_id`)** — agencies and inspectors never see scores or rankings (D4); the `AuthGuard` **redirects** denied roles to `/dashboard` (its shared behaviour — not `NoPermissionState`). Pieces: `useReliabilityRanking`/`useInspectorReliability` (keys `['reliability','ranking']` / `['reliability','inspector',id]`, enabled only with an id, 400/404 → `isNotFound`), `RankingTable` (DataTable; rows are **not** keyboard-focusable, so the actionable control is a focusable button in the "Inspector" cell with `aria-label "Open {name} details"`, `onRowClick` for pointer), `NotEnoughDataList`, `ReliabilityDrawer`/`MetricRow`/`MetricFailures`, `FreshnessBanners` (pure `lib/freshness.ts` decides which banner; stale only ≥ 05:00 Sydney, recompute <15/≥15 min; **no polling**), and `lib/format-metric.ts` which owns the **UI metric copy** (richer than the terse shared `RELIABILITY_METRIC_LABELS` — the shared enum delegates "the exact UI copy" to this task; do not mutate the shared enum) plus a **deterministic `D MMM YYYY` date formatter** (fixed month array, never `toLocaleDateString` — ICU/Node drift; the shared `formatCivilDate` is `dd/mm/yyyy`) and `formatReliabilityInstant` (Sydney civil date + `formatInstantTime`, always `PLATFORM_TIMEZONE`). Sidebar "Dashboard" group gains **"Inspector performance"** (`mdi-podium`, AM/OP) after "Workload" (canonical X01 order; keep-all file — coordinate with F10-2). `features/platform-settings/` gains **`ReliabilityIndexSection`** (`usePlatformSetting('reliabilityIndex')`, anchor `id="reliability-index"`, 8 integer weights + min volume + optional override + min ratings, AM **and** OP edit/save — L-F07-11; on save it also invalidates `['reliability']` so the ranking refetches — the first settings section to use `useQueryClient`, so the page test now wraps in a `QueryClientProvider`). `StatusTransitionDialog` gains `currentStatus` + `error` props: reject options come from the shared `allowedRejectionCodesFrom(currentStatus)` (still filtering `SYSTEM_ONLY_REJECTION_CODES`) so `INSPECTOR_NO_SHOW` shows only from `SCHEDULED` and `NOT_EXECUTED` only from `DONE`, each with a reliability-score hint; `useAppointmentTransition.transition` now resolves to the error message (or `null`) so `AppointmentTransitionActions` keeps the dialog open on a `422 REJECTION_CODE_NOT_ALLOWED` (callers pass `currentStatus={appointment.status}`). The "Level" column is **out of scope** (F08 web).

16. **Portal — report a problem (F10-4).** `features/rental-tenant-portal/` gains `PortalReportProblemSection` (+ `hooks/usePortalIssues.ts`), rendered in `PortalPage` **before** the confirm control (gated by `disabled={isReadOnly || isTerminal}`), consuming the F10-4 token routes (`api-types` regenerated by that task). The tenant writes a description (≤`PROPERTY_ISSUE_REASON_MAX`) and optionally adds up to `PORTAL_MAX_PHOTOS_PER_ISSUE` (5) photos; each photo uploads **one at a time** (presign → PUT to the signed URL → confirm, `uploadPortalIssuePhoto`) with per-photo progress/error so a single failure keeps the already-confirmed ones (D12); a 503 shows the shared `FILE_STORAGE_UNAVAILABLE_MESSAGE` (D16). "Submit report" is separate from confirming; the create call carries a stable `Idempotency-Key` from the shared `createIdempotencyKeyManager` (rotated on success, D24). A read-only list of the tenant's own submitted reports (reason + photo count, no reviewer identity) renders in the same section and is the only read-back (no download route). Writes are hidden for a read-only token; the list still shows. No backend/schema change (consumes the F10-4 contract). **Note:** the existing `PortalPage.test.tsx` confirm-flow selector was pinned to `/^submit$/i` so it no longer collides with the new "Submit report" button.

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
