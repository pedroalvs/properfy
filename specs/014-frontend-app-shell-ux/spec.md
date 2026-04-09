# Feature Specification: Frontend App Shell & UX Patterns

**Feature Branch**: `014-frontend-app-shell-ux`
**Created**: 2026-04-06
**Feature Status**: IMPLEMENTED (Phase 1 shell and core patterns) — gaps in map views, board/kanban, and some responsive edge cases
**Sources**:
- Code: `apps/web/src/components/`, `apps/web/src/features/`, `apps/web/src/hooks/`, `apps/web/src/app/router.tsx`
- Approved rules: `projeto-consolidado/frontend-system-spec.md`, `projeto-consolidado/layout-behavior-rules.md`, `projeto-consolidado/component-inventory.md`, `projeto-consolidado/frontend-decisoes-finais.md`
- Legacy reference: `projeto-consolidado/ui-system-atual.md` (Vue 2 + Vuetify 2 system being migrated)
- Web workspace: `apps/web/CLAUDE.md`

> **Reading guide.** This spec defines the **canonical frontend shell and recurring UX patterns** that all feature-specific frontend specs build upon. It is not a design system token spec — it focuses on page-level composition, interaction patterns, and the rules operators experience when using Properfy.
>
> `Status` values: `IMPLEMENTED` (present in code), `APPROVED` (binding rule from dossier, may not be fully implemented), `DIVERGENCE` (code contradicts dossier), `GAP` (not yet approved or implemented).

## User Scenarios & Testing

### User Story 1 — Operator navigates the platform via the app shell (Priority: P1)

- **Status**: IMPLEMENTED
- **Source**: code

An authenticated operator (AM, OP, CL_ADMIN, CL_USER) or inspector (INSP) lands on the platform and sees a persistent sidebar on the left with icon-based navigation. They click an icon to navigate to a feature area. The sidebar shows only items relevant to their role — items they cannot access are hidden, not disabled. At the bottom, a user section provides access to profile settings and logout.

**Why this priority**: The app shell is the container for everything. Without it, no feature page can be reached.

**Independent Test**: Log in as each role (AM, OP, CL_ADMIN, CL_USER, INSP). Verify the sidebar shows only permitted navigation items. Click each item and confirm navigation to the correct page. Open the user menu and verify settings and logout work.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** the app loads, **Then** a fixed 75px sidebar appears on the left with icon-based navigation items filtered by the user's role.
2. **Given** a navigation item with a submenu (e.g., "Users", "Configuration"), **When** the user hovers or clicks the icon on desktop, **Then** a floating glassmorphic submenu appears to the right of the sidebar showing sub-items.
3. **Given** the user is on a specific page, **When** they view the sidebar, **Then** the active item shows a left-side bar indicator (4px, secondary color) and full opacity icon.
4. **Given** a submenu where all sub-items are hidden by role filtering, **When** the sidebar renders, **Then** the parent submenu icon is also hidden entirely.
5. **Given** a mobile viewport (< 768px), **When** the user taps the hamburger menu, **Then** the sidebar opens as a drawer from the left (max 18rem wide) with full text labels visible alongside icons. Tapping the backdrop closes it.
6. **Given** the user section at the bottom of the sidebar, **When** they click the settings icon (desktop) or tap the user area (mobile), **Then** a menu appears with "Edit Profile", "Change Password", and "Log out" options.

---

### User Story 2 — Operator browses a data list with filters and table (Priority: P1)

- **Status**: IMPLEMENTED
- **Source**: code

The most common page pattern in Properfy: the operator sees a page title with optional action buttons, a filter bar with search and category filters, and a data table below. This pattern is used for appointments, properties, users, inspectors, tenants, service types, pricing rules, audit logs, and more.

**Why this priority**: This is the dominant page pattern — over 70% of pages follow it.

**Independent Test**: Open any list page (e.g., Appointments). Verify the page header shows title and action buttons. Apply a search filter — table updates. Apply a status filter — table updates. Click pagination controls — table pages correctly. Click a row — detail drawer or detail page opens.

**Acceptance Scenarios**:

1. **Given** a list page, **When** it loads, **Then** the page shows: PageHeader (title + primary action + optional secondary actions), FilterBar (responsive grid of filter inputs), and DataTable (columns, rows, pagination).
2. **Given** a FilterBar, **When** the user types in the search input, **Then** the table filters after a 300ms debounce. A clear button (X) appears when the field has a value.
3. **Given** a FilterSelect, **When** the user opens the dropdown and selects an option, **Then** the table filters immediately. A clear button allows resetting.
4. **Given** the DataTable is loading data, **When** the user views the table, **Then** skeleton rows with shimmer animation are displayed (not a spinner alone).
5. **Given** the DataTable receives an error, **When** displayed, **Then** an error message with a "Try Again" button appears in the table area.
6. **Given** no data matches the current filters, **When** displayed, **Then** an empty state message appears ("No records found" or contextual message). This is distinct from "no data yet" (which may include a CTA to create).
7. **Given** a desktop viewport, **When** the filter bar renders, **Then** filters display in a responsive grid (1 column mobile, 2 columns sm, 3 columns md, 4 columns lg/xl).
8. **Given** the table has pagination, **When** the user interacts with pagination controls, **Then** they can change page size (10/20/50), navigate pages (prev/next), and see "Showing X-Y of Z".
9. **Given** a mobile viewport, **When** the table renders, **Then** columns marked `hideOnMobile` are hidden and rows may render as stacked cards instead of table rows.

---

### User Story 3 — Operator views and edits details via drawers (Priority: P1)

- **Status**: IMPLEMENTED
- **Source**: code

When an operator clicks a table row or an action button, a drawer slides in from the right to show details or a form. Drawers are the primary pattern for detail views and edit forms — full page navigation is reserved for complex multi-step flows (create wizards, import wizards). Drawers come in two sizes: narrow (480px) for simple content, wide (970px) for complex operational context.

**Why this priority**: Drawers are the core interaction pattern for viewing and editing entities without losing list context.

**Independent Test**: On any list page, click a table row. Verify a drawer slides in from the right with entity details. Close the drawer via the X button, Escape key, or backdrop click. Open an edit drawer — verify form fields load. Submit — verify the drawer closes and the list refreshes.

**Acceptance Scenarios**:

1. **Given** a trigger (row click, action button), **When** the drawer opens, **Then** it slides in from the right with a 300ms animation, a semi-transparent backdrop appears behind it, and the main content does not resize.
2. **Given** an open drawer, **When** the user clicks the backdrop, presses Escape, or clicks the X button, **Then** the drawer closes with a slide-out animation.
3. **Given** a detail drawer, **When** displayed, **Then** it shows a DrawerHeader (title + close button + optional actions) and scrollable content below.
4. **Given** a narrow drawer (480px), **When** opened, **Then** it is appropriate for simple detail views (single entity, short forms).
5. **Given** a wide drawer (970px), **When** opened, **Then** it is appropriate for complex operational data (multi-section details, side-by-side comparisons). Max width is capped at 95vw.
6. **Given** a form inside a drawer, **When** the user submits, **Then** the primary button shows a loading state to prevent double-clicks, and on success the drawer closes and a success snackbar appears.

---

### User Story 4 — Operator uses tab-based page sections (Priority: P2)

- **Status**: IMPLEMENTED
- **Source**: code

Some pages organize content into tabs — e.g., a tenant detail page with "General", "Branches", "Financial" tabs, or a financial page with "Entries" and "Invoices" tabs. Tabs allow the operator to switch between related views without leaving the page.

**Why this priority**: Tabs are the second most common page composition pattern after list+filter+table.

**Independent Test**: Open a page with tabs (e.g., Financial). Verify tabs render with the correct active state. Click a different tab — content switches. Verify the active tab has the coral underline slider and secondary text color.

**Acceptance Scenarios**:

1. **Given** a tabbed page, **When** it loads, **Then** the active tab shows secondary color (#21566E) text with 700 weight, and a coral (#F37A76) underline slider animates to the active tab position.
2. **Given** inactive tabs, **When** displayed, **Then** they show muted text (#999999) with 700 weight.
3. **Given** a tab with a badge (e.g., count), **When** displayed, **Then** a coral pill badge appears to the right of the tab label.
4. **Given** the user clicks a different tab, **When** the content switches, **Then** the slider animates to the new tab position (200ms transition) and the tab panel content updates without a full page reload.

---

### User Story 5 — Operator views an operational map with side panel (Priority: P2)

- **Status**: PARTIALLY IMPLEMENTED (MapContainer is placeholder; MapScreenLayout exists)
- **Source**: code + dossier

For geographic features (service regions, appointment maps, property maps), the operator sees a fullscreen map with a functional side panel. The side panel contains filters, lists, or detail cards. The map is a utility tool — not decorative. Markers, clusters, and polygon selections have clear visual semantics.

**Why this priority**: Map views are critical for service region management, appointment geographic distribution, and inspector coverage visualization.

**Independent Test**: Open a map page. Verify the two-column layout (side panel + map). Collapse/expand the filter panel above the map. On mobile, verify the layout stacks vertically (side panel above map).

**Acceptance Scenarios**:

1. **Given** a map page, **When** it loads, **Then** the layout shows a side panel (400px default) on the left and the map filling the remaining space.
2. **Given** a map with a filter panel, **When** the user clicks the filter header, **Then** it collapses/expands with a smooth height animation.
3. **Given** a mobile viewport, **When** the map page renders, **Then** the layout stacks vertically (side panel above map) instead of side-by-side.
4. **Given** the sidebar on a map page, **When** displayed, **Then** its background changes to match the app background (#F5F5F5) as specified by the dossier. (`APPROVED RULE` — verify implementation matches.)

---

### User Story 6 — Operator receives feedback via snackbar notifications (Priority: P2)

- **Status**: IMPLEMENTED
- **Source**: code

After performing actions (create, update, delete, import), the operator receives a brief notification in the top-right corner. Success shows a green toast, errors show a dark red toast with a friendly message and request ID (never raw JSON in production). Toasts auto-dismiss after 5 seconds or can be manually closed.

**Why this priority**: Consistent feedback is essential for operator confidence in every action.

**Independent Test**: Trigger a successful create action — verify green snackbar appears top-right with success message and auto-dismisses after 5s. Trigger an error — verify dark red snackbar with friendly message and request ID.

**Acceptance Scenarios**:

1. **Given** a successful action, **When** the snackbar appears, **Then** it shows a green background with check-circle icon and the success message. It auto-dismisses after 5 seconds.
2. **Given** an error, **When** the snackbar appears, **Then** it shows a dark red background with alert-circle icon, a user-friendly message, and the request ID. No raw JSON or stack traces in production.
3. **Given** multiple notifications, **When** they appear simultaneously, **Then** they stack vertically with 8px gap in the top-right corner.
4. **Given** any snackbar, **When** the user clicks the X button, **Then** it dismisses immediately.

---

### User Story 7 — Operator interacts with confirmation dialogs (Priority: P2)

- **Status**: IMPLEMENTED
- **Source**: code

For destructive or critical actions (delete, deactivate, cancel), the operator sees a centered modal dialog asking for confirmation. The dialog has a simple title, descriptive body, and two buttons: a secondary cancel and a primary confirm (coral color for constructive, error color for destructive).

**Why this priority**: Prevents accidental data loss from irreversible actions.

**Independent Test**: Click "Delete" on any entity row. Verify a dialog appears centered with backdrop. Click "Cancel" — dialog closes, no action. Click "Confirm" — action executes, dialog closes.

**Acceptance Scenarios**:

1. **Given** a destructive action trigger, **When** the dialog opens, **Then** it appears centered on screen with a semi-transparent backdrop and a simple title (20px, 500 weight).
2. **Given** the dialog, **When** the user clicks the backdrop or presses Escape, **Then** the dialog closes without executing the action.
3. **Given** the dialog, **When** the user clicks "Confirm", **Then** the action executes, the confirm button shows a loading state, and on completion the dialog closes.

---

### User Story 8 — Platform enforces role-based route protection (Priority: P1)

- **Status**: IMPLEMENTED
- **Source**: code

The platform prevents unauthorized access at the route level. An unauthenticated user is redirected to the login page. An authenticated user attempting to access a route outside their role's permissions is redirected to the dashboard. Routes are protected by a two-layer guard: authentication (ProtectedRoute) and authorization (AuthGuard with role list).

**Why this priority**: Security foundation — no feature page is accessible without proper authentication and authorization.

**Independent Test**: As an INSP user, attempt to navigate to `/appointments` (which is restricted to AM, OP, CL_ADMIN, CL_USER). Verify redirect to `/dashboard`. Log out, attempt to visit any protected route — verify redirect to `/login`.

**Acceptance Scenarios**:

1. **Given** an unauthenticated user, **When** they navigate to any protected route, **Then** they are redirected to `/login` and the intended URL is saved for post-login redirect.
2. **Given** an authenticated user with insufficient role, **When** they navigate to a role-restricted route, **Then** they are redirected to `/dashboard`.
3. **Given** any route change, **When** the app resolves the route, **Then** code splitting loads only the relevant page chunk. On chunk load failure (stale deployment), the page auto-retries with a reload.

---

### Edge Cases

- **Stale deployment chunks**: When a new deployment invalidates cached JS chunks, the `lazyRetry()` helper automatically reloads the page once to fetch fresh chunks. If the retry also fails, an error boundary catches it.
- **Sidebar overflow on many nav items**: The sidebar is scrollable when items exceed viewport height. Submenus float independently and are not affected by sidebar scroll position.
- **Drawer over drawer**: Not supported. Only one drawer can be open at a time. A second trigger should close the first before opening the new one (or use a dialog inside the drawer for confirmations).
- **Filter state on navigation**: Filter values are held in component state via hooks. Navigating away and back resets filters to defaults. URL-persisted filter state is a future gap.
- **Mobile table card layout**: When columns exceed mobile width, the table switches to card layout. Columns with `hideOnMobile: true` are hidden. Row actions remain accessible.
- **Concurrent snackbar accumulation**: If many operations fire in rapid succession, snackbars stack. No cap is currently enforced — a future enhancement could limit visible snackbars to 3-5.
- **Tenant context for global roles**: AM and OP users on certain pages (e.g., Financial) must first select a tenant before seeing data. The tenant selector pattern is page-specific, not shell-level.

## Requirements

### Functional Requirements

All FRs below are `Status: IMPLEMENTED, Source: code` unless otherwise noted.

#### App Shell

- **FR-001**: The app shell MUST render a fixed 75px sidebar on desktop (>= 768px) with icon-based navigation and a scrollable main content area to the right.
- **FR-002**: The sidebar MUST filter navigation items by the authenticated user's role. Items outside the user's permissions MUST be hidden, not disabled.
- **FR-003**: Submenus MUST appear as floating glassmorphic overlays (backdrop-blur, semi-transparent white) positioned to the right of the parent icon.
- **FR-004**: On mobile (< 768px), the sidebar MUST convert to a drawer triggered by a hamburger menu button, showing full text labels alongside icons.
- **FR-005**: The main content area MUST have a rounded top-left corner (20px radius) and subtle shadow on desktop, creating a visual card-on-canvas effect.
- **FR-006**: The user section MUST be fixed at the bottom of the sidebar with settings icon (desktop) or full user area (mobile).

#### Page Templates

- **FR-007**: The platform MUST provide a **ListFilterTableTemplate** composing PageHeader + FilterBar + DataTable for the standard list page pattern.
- **FR-008**: The platform MUST provide a **TabsContentTemplate** composing PageHeader + TabsNav + tab panels for tabbed content pages.
- **FR-009**: The platform MUST provide a **GroupedListTemplate** for pages that display data grouped by period or category with section headers.
- **FR-010**: The platform MUST provide a **MapScreenLayout** composing a side panel (400px default, scrollable) and a map area (flex-1) for fullscreen operational map views.

#### DataTable

- **FR-011**: DataTable MUST support generic typed columns with key, label, width, alignment, custom render function, sortable flag, and `hideOnMobile` flag.
- **FR-012**: DataTable MUST handle three global states: loading (skeleton rows), error (message + retry button), and empty (contextual message + optional CTA).
- **FR-013**: DataTable MUST support client-side column sorting with ascending/descending toggle and visual sort indicator.
- **FR-014**: DataTable MUST support pagination with page size options (10, 20, 50), previous/next navigation, direct page input, and "Showing X-Y of Z" display.
- **FR-015**: DataTable MUST switch to a card layout on mobile viewports, stacking column label/value pairs vertically per row.

#### Filters

- **FR-016**: FilterBar MUST render its children in a responsive grid (1 column mobile, 2 sm, 3 md, 4 lg/xl) with consistent gap spacing.
- **FR-017**: All filter inputs MUST use shadow-based borders (not standard HTML borders) with floating labels, matching the legacy Vuetify outlined dense visual style.
- **FR-018**: FilterInput (search) MUST debounce onChange by 300ms and show a clear button when the field has a value.
- **FR-019**: The platform MUST provide FilterSelect, FilterAutocomplete, FilterDateRange, and FilterBoolean components with consistent visual styling.

#### Drawers

- **FR-020**: DrawerPanel MUST slide in from the right with a 300ms animation, show a semi-transparent backdrop (z-40), and the drawer itself at z-50.
- **FR-021**: Drawers MUST be closable via X button, Escape key, or backdrop click.
- **FR-022**: Two drawer sizes MUST be supported: narrow (480px) and wide (970px, max 95vw).

#### Feedback & States

- **FR-023**: Every data-driven screen MUST handle 5 global states: loading (skeleton), error (retry), empty (contextual), no permission (clear message), and filter-required (contextual prompt). (`APPROVED RULE, Source: dossier` — some screens may not implement all 5 yet.)
- **FR-024**: Snackbar notifications MUST appear top-right, auto-dismiss after 5 seconds, support success/error/info variants, and never show raw JSON or stack traces in production.
- **FR-025**: Confirmation dialogs MUST be centered, support backdrop/Escape dismissal, and show a loading state on the confirm button during execution.

#### Responsive Behavior

- **FR-026**: The primary experience is desktop. Mobile MUST be functional but is not the primary design target.
- **FR-027**: On mobile, primary action buttons MUST render as a Floating Action Button (FAB) at the bottom-right (64px circle, coral color) instead of inline buttons.
- **FR-028**: Page title font size MUST reduce from 24px (desktop) to 20px (mobile).

#### Role-Based UI

- **FR-029**: Route protection MUST use two layers: ProtectedRoute (authentication check) and AuthGuard (role-based authorization).
- **FR-030**: UI elements (buttons, navigation items, table actions) MUST be hidden — not disabled — when the user's role lacks permission.

### Key Entities

- **PageTemplate** — A reusable composition pattern (ListFilterTable, TabsContent, GroupedList, MapScreen) that defines the standard arrangement of header, content, and interaction areas for a page type.
- **FilterBar** — A responsive container housing filter inputs (search, select, autocomplete, date range, boolean) that drive data queries.
- **DataTable** — The canonical data display component with columns, sorting, pagination, row actions, and responsive mobile card fallback.
- **DrawerPanel** — A slide-in overlay panel (narrow or wide) used for detail views and forms without leaving the list context.
- **AppShell** — The root layout composing sidebar navigation and main content area, with role-filtered navigation and responsive mobile drawer behavior.
- **Snackbar** — Global notification toast system with success/error/info variants and auto-dismiss.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Every list page in the platform uses the ListFilterTableTemplate pattern consistently — verified by visual audit of all list pages.
- **SC-002**: The sidebar shows correct navigation items for each of the 5 user roles — verified by E2E test logging in as each role and asserting visible items.
- **SC-003**: Every data table displays all 3 global states (loading, error, empty) correctly — verified by E2E tests simulating each state.
- **SC-004**: Drawer interactions (open, close via 3 methods, form submit) complete in under 500ms — verified by Playwright timing assertions.
- **SC-005**: All filter inputs maintain visual consistency with the approved shadow-border + floating-label style — verified by visual snapshot tests.
- **SC-006**: Mobile layout is functional for all page templates — sidebar becomes drawer, tables become cards, FAB replaces inline buttons — verified by responsive viewport E2E tests.
- **SC-007**: No raw JSON or stack traces appear in production snackbar notifications — verified by error simulation tests.
- **SC-008**: Code splitting works correctly — navigating between pages loads chunks on demand with under 2 second load time — verified by Lighthouse performance audit.

## Assumptions

- Desktop is the primary experience target; mobile support is functional but not pixel-perfect.
- The design token palette (colors, typography, spacing) is inherited from the legacy Vue 2 + Vuetify 2 system and is already defined in `apps/web/src/styles/tokens.css`. This spec does not redefine tokens — it references them.
- Board/Kanban view is **out of initial scope** per the final decisions document. It may be introduced as an opt-in per-page feature in a future phase.
- Map integration uses Mapbox. The MapContainer is currently a placeholder — full map rendering depends on Mapbox token configuration and is tracked as a cross-cutting concern.
- The font family is Nunito (body) with Poppins available for headings. Icons use Material Design Icons (`@mdi/font`).
- All data fetching uses React Query with automatic cache invalidation on mutations. This is established infrastructure, not new work.
- Filter state is held in component-level hooks, not persisted in URLs. URL-based filter persistence is a future gap.
- The tenant portal (`/tenant-portal/:token`) has its own layout and rules independent of the app shell — it is not covered by this spec.
- The PWA (`apps/pwa/`) has its own component system optimized for inspector mobile workflows — it shares design tokens but not shell components.

## Known Gaps

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Map integration placeholder | H | MapContainer exists but renders placeholder content. Full Mapbox integration pending configuration. Blocks service region map, appointment map, property map. |
| GAP-002 | Board/Kanban view | L | Explicitly out of initial scope per `frontend-decisoes-finais.md`. May be added as opt-in per-page feature later. |
| GAP-003 | URL-persisted filter state | M | Filters reset on navigation. Operators lose filter context when returning to a list page. URL-based filter persistence would preserve state across navigation. |
| GAP-004 | TableSwitch (extra column toggle) | L | Dossier defines a per-page opt-in toggle to reveal additional columns. Not yet implemented in the shared DataTable. |
| GAP-005 | Filter loading indicator | L | Dossier specifies a circular spinner within the filter block during data fetch. Current implementation does not show a filter-level loading state (relies on table skeleton). |
| GAP-006 | All 5 mandatory states on every screen | M | Dossier mandates loading, error, empty, no-permission, and filter-required states on every data screen. Not all screens implement the full set (especially no-permission and filter-required). |
| GAP-007 | Sidebar map-mode background | L | Dossier specifies sidebar background changes to app-bg gray on map pages. Need to verify this is implemented. |
| GAP-008 | FloatingTotalBar for invoices | L | Dossier defines a gradient animated floating bar for financial totals. Not yet implemented. |
