# Feature Specification: Dashboard Sidebar Group and Standard Back Button (X01)

**Feature Branch**: `034-x01-dashboard-nav-back`  
**Created**: 2026-10-29  
**Status**: Draft  
**Input**: User description: "Dashboard sidebar menu group and Back button across web sub-screens"

## Context

This is task **TASK-X01-1** of Properfy Phase 2, Stage 1. It is a **web-only** navigation
change (`apps/web`). It is **outside the client contract** (a developer-requested
improvement), so **no contract acceptance codes (`xx.A#`) apply**; the acceptance criteria
below are the task's own.

It introduces two things and removes one:

1. A **Dashboard sidebar group** that gathers the three panel screens (Overview, Analytics,
   Workload) under one menu group, replacing today's single flat "Dashboard" item and the
   in-header cross-navigation buttons.
2. A **standard Back button** (icon + visible text "Back") on every web sub-screen, backed by
   a corrected `useGoBack` hook.
3. Removal of the cross-navigation "cluster" buttons from the three (frozen) dashboard headers.

**Why it must merge first:** X01 defines the *canonical child order* of the Dashboard group.
Four later features (F02 Inspector notices, F05 Live Day, F07 Inspector performance, F08 Goals
& rewards) each insert a child into this group, and they adopt X01's test arrangement
(`Sidebar.roles.test.tsx` without `SidebarSubmenu`/`SidebarItem` mocks) and its `backTo`/
`BackButton` fallback rule. X01 must be merged before all of them.

**No new data, routes, settings keys, jobs or migrations.** Front-end only. The multi-tenant
rule (root `CLAUDE.md` §7) and the pending product decisions (Q2/Q4/Q6/Q12) are **not
applicable**: X01 adds no entity, endpoint or tenant-scoped data.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dashboard panel screens grouped in the sidebar (Priority: P1)

An operator or agency user reaches every panel screen (Overview, Analytics, Workload) from one
"Dashboard" group in the left sidebar, instead of landing on Overview and then hunting for
cross-navigation buttons inside the dashboard headers.

**Why this priority**: This is the structural change the four downstream Phase 2 features
depend on; it also removes a confusing navigation pattern (buttons that jump between panels).
It must ship first so the canonical child order is fixed.

**Independent Test**: Render the sidebar for each role and assert the Dashboard group shows the
right children (by label) in the canonical relative order, each pointing at a route the role's
`AuthGuard` allows; assert `filterNavItems` collapses to a plain item for a single-child role.

**Acceptance Scenarios**:

1. **Given** an AM or OP user, **When** the sidebar renders, **Then** a "Dashboard" group button
   (`aria-haspopup="menu"`) exists and, when opened, lists menuitems Overview (`/dashboard`),
   Analytics (`/analytics`) and Workload (`/inspector-workload`), found by label.
2. **Given** a CL_ADMIN or CL_USER user, **When** the group opens, **Then** it lists Overview and
   Analytics but **not** Workload.
3. **Given** an INSP user (sees only Overview), **When** the sidebar renders, **Then** "Dashboard"
   is a plain link to `/dashboard` with no `aria-haspopup`, and Analytics/Workload are absent.
4. **Given** an AM on `/analytics` or `/inspector-workload`, **When** the sidebar renders, **Then**
   the Dashboard group shows its active indicator.
5. **Given** the exported `NAV_ITEMS`/`filterNavItems`, **When** `filterNavItems(NAV_ITEMS, 'AM')`
   is called with two arguments, **Then** it compiles (third param optional) and the Dashboard
   group contains children with `to: '/analytics'` and `to: '/inspector-workload'`.

---

### User Story 2 - Standard Back button on every sub-screen (Priority: P1)

A user on any sub-screen (detail, create, import, settings sub-page, invoices, lists reached
from the map) sees a single Back button with icon + visible text "Back" at the top-left of the
header. With in-app history it returns to the previous screen (preserving its query); when the
sub-screen was opened directly (fresh tab, refresh of a first entry, direct link, login/redirect)
it goes to the screen's parent.

**Why this priority**: It is the second half of the task and the one the `useGoBack` correctness
fix (L-X01-01) lives in; the fix also repairs `AppErrorBoundary`, which already consumes the hook.

**Independent Test**: For each sub-screen, render under a router, assert exactly one button named
"Back" exists before the heading; click it after a direct entry (history index 0) and assert the
screen's fallback; click it after an in-app push and assert the previous route.

**Acceptance Scenarios**:

1. **Given** a sub-screen opened directly (`history.state.idx === 0`), **When** Back is clicked,
   **Then** the app navigates to the screen's fallback route (per the §4 table of the task).
2. **Given** a sub-screen reached by an in-app push, **When** Back is clicked, **Then** the app
   calls `navigate(-1)` and the previous route (with its query) is shown.
3. **Given** a direct entry where a filter/tab/drawer was later written with `replace`
   (`history.state.idx` stays `0`), **When** Back is clicked, **Then** it still goes to the
   fallback — never a no-op, never leaving the app (L-X01-01).
4. **Given** a create screen with a dirty form, **When** Back is clicked, **Then** the discard
   confirmation opens and no navigation happens; "Discard" navigates via the page's `goBack`,
   "Cancel" stays.
5. **Given** a wizard (Appointment import preview/confirm, Service group create step 2),
   **When** it renders, **Then** the step-back control is labelled "Previous step" and the header
   has exactly one button named "Back".
6. **Given** `TenantDetailPage` opened directly, **When** Back is clicked, **Then** CL_ADMIN goes
   to `/dashboard` (no permission toast) and AM/OP go to `/tenants`; the error `EmptyState` uses
   the same per-role target ("Back to Dashboard" / "Back to Agencies").

---

### User Story 3 - Dashboard headers lose their cross-navigation buttons (Priority: P2)

The three panel screens stop rendering the in-header buttons that jumped between panels, because
the sidebar group now owns that navigation. Nothing else on those (frozen) screens changes.

**Why this priority**: It is the authorized exception to the "existing dashboards are frozen"
rule; it is small and depends on US1 being the new navigation path.

**Independent Test**: Render each of the three pages for every role and assert no header buttons
named "Analytics"/"Workload"/"Dashboard" and no "Back" button; assert the rest (cards, charts,
`WeekSelector`, "New Appointment") is unchanged.

**Acceptance Scenarios**:

1. **Given** `DashboardPage` for any role, **When** it renders, **Then** there is no "Analytics"
   or "Workload" header button and no "Back" button; the "New Appointment" primary action (when
   permitted) still renders (desktop + FAB).
2. **Given** `AnalyticsPage`, **When** it renders, **Then** there are no "Dashboard"/"Workload"
   header buttons and no "Back" button; period/state/revenue-gating behaviour is unchanged.
3. **Given** `InspectorWorkloadPage`, **When** it renders, **Then** there are no
   "Dashboard"/"Analytics" header buttons and no "Back" button; the `WeekSelector` stays.

### Edge Cases

- **Sub-screen opened from another sub-screen** (detail → related detail): with history, Back
  returns to the previous detail (`navigate(-1)`).
- **Refresh (F5)**: `history.state.idx` survives; if the entry had prior app history (`idx > 0`)
  Back returns there, else it goes to the fallback.
- **Redirect-only arrival** (`/appointments/new` → `/appointments?new=1`): the redirect uses
  `replace`, preserving `idx`; direct arrival (`idx === 0`) goes to the fallback `/map`; closing
  the `?new=1` drawer (`replace`) does not change that.
- **Logged-out direct link** (`/appointments/<id>` → `/login` → destination, all `replace`,
  `idx === 0`): Back goes to `/appointments`; the login is never the "previous" screen.
- **New tab** (`target="_blank"`, `window.open`, Ctrl/Cmd+click) and **tab opened from another
  site**: `idx === 0` → fallback inside the app; Back is never a no-op and never exits the app.
- **Board opened directly with a query**: fallback is `/appointments` without the query (accepted);
  with history the query is preserved. "List" and "Map View" stay beside Back (L-X01-05).
- **Import during commit**: the header Back click is ignored (override), the route is unchanged
  and the final report still appears; the button keeps no `disabled` state (L-X01-06). The
  "Previous step" wizard button stays `disabled` during the commit as today.
- **INSP**: the only reachable sub-screen is `/settings/account` → fallback `/dashboard`.
- **Analytics and Workload**: top-level screens, **no Back button**; reached only via the menu.
- **`PageHeader` without `backTo`**: renders with no Back button and calls no router hooks, so it
  still works when rendered outside a router (existing `PageHeader.test.tsx` behaviour).

## Requirements *(mandatory)*

### Functional Requirements

**Menu (P1 / US1):**

- **FR-001**: `NAV_ITEMS` MUST replace the flat Dashboard item with a group whose children are
  Overview (`/dashboard`, all roles), Analytics (`/analytics`, roles AM/OP/CL_ADMIN/CL_USER) and
  Workload (`/inspector-workload`, roles AM/OP), in the canonical order; the group carries
  `collapseIfSingle: true`. `NavItem` gains `collapseIfSingle?: boolean`, used only by this group.
- **FR-002**: Each child's `roles` MUST mirror the route's `AuthGuard` exactly (Overview has no
  `roles`, like `/dashboard`).
- **FR-003**: `filterNavItems` MUST, after filtering children by role: discard a group with 0
  visible children (current behaviour); return a plain item `{ icon, label, to: child.to }` when a
  `collapseIfSingle` group has exactly 1 visible child; return the group otherwise. Groups without
  the flag keep current behaviour (Users, Configuration unchanged).
- **FR-004**: `NAV_ITEMS` and `filterNavItems` MUST be exported from `Sidebar.tsx`, and
  `filterNavItems`'s third parameter MUST become optional: `filterNavItems(items, role, clUserPermissions?: string[])`.
- **FR-005**: The Dashboard group MUST show its active indicator on `/dashboard`, `/analytics` and
  `/inspector-workload`; the active child inside the flyout keeps the existing highlight.
- **FR-006**: The canonical child order (for X01 and future inserts) is: Overview · Live Day (F05)
  · Inspector notices (F02) · Analytics · Workload · Inspector performance (F07) · Goals & rewards
  (F08). X01 ships only Overview, Analytics, Workload. No placeholders for future children.

**Back button (P1 / US2):**

- **FR-007**: `useGoBack(fallbackPath)` MUST decide "app history exists" by
  `const idx = window.history.state?.idx; const hasAppHistory = typeof idx === 'number' ? idx > 0 : location.key !== 'default';`
  — `navigate(-1)` when true, `navigate(fallbackPath)` otherwise. The `key` branch is kept only as
  the fallback for memory routers (tests). The JSDoc MUST describe the `idx` criterion.
- **FR-008**: A new `components/layout/BackButton.tsx` MUST render
  `<button type="button" aria-label="Back">` containing `<i class="mdi mdi-arrow-left" aria-hidden>`
  and a visible `<span>Back</span>`, calling `useGoBack(to)` internally. Props:
  `to: string`, `onClick?: (goBack: () => void) => void`, `className?: string`. With `onClick`, the
  button MUST call only `onClick(goBack)` and not navigate on its own (the page decides). It MUST
  be exported from `components/layout/index.ts`.
- **FR-009**: `PageHeader` MUST gain `backTo?: string` and `onBack?: (goBack) => void`. With
  `backTo`, it renders `<BackButton to={backTo} onClick={onBack} />` immediately before the `<h1>`
  on the same line. Without `backTo`, it renders no BackButton and calls no router hooks; `onBack`
  without `backTo` is ignored. `ListFilterTableTemplate` MUST gain `backTo?: string` and pass it
  through.
- **FR-010**: Each of the 15 sub-screens in the task's §4 table MUST show exactly one header Back
  button with icon + visible "Back", replacing today's "Go back" icon-only buttons, text links and
  `secondaryActions` "Back". Fallbacks are per the §4 table; `TenantDetailPage` computes its
  fallback per role.
- **FR-011**: Create screens with unsaved-change confirmation MUST use the `onBack` override and
  share one `BACK_TO` constant between the page's own `useGoBack` and `backTo`.
- **FR-012**: Wizard step-back controls (Appointment import preview & confirm; Service group create
  step 2) MUST be relabelled "Previous step" (behaviour unchanged), so no screen has two controls
  named "Back".
- **FR-013**: `AppointmentImportPage` header Back MUST use
  `onBack={(goBack) => { if (!isCommitting) goBack(); }}` and remove the top `<Link>` "Back to
  Appointments" (the CSV template link stays). `AppointmentBoardPage` MUST keep "List" and
  "Map View" beside Back. `TenantDetailPage` error `EmptyState` MUST use the per-role `backTo`.
- **FR-014**: `backTo` MUST be a route every role of the sub-screen can open; otherwise it is
  computed per role (as in `TenantDetailPage`). The direct-entry fallback test runs with the most
  restricted role that opens the screen.

**Dashboard headers (P2 / US3):**

- **FR-015**: `DashboardPage`, `AnalyticsPage` and `InspectorWorkloadPage` MUST remove the cluster
  cross-navigation buttons and any now-unused imports/comments/vars; **no other change** to those
  frozen screens. The three screens remain top-level (no Back button).

**Accessibility / visual (US2):**

- **FR-016**: The Back button's accessible name equals its visible text "Back" (WCAG 2.5.3). It is
  the first focusable element of the page content (before title and actions), operable with Enter
  and Space (native `<button>`), with the repo focus ring
  (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`) and no disabled
  state. Default/hover styles per the task's state table.

**Docs (US1+US2):**

- **FR-017**: `apps/web/CLAUDE.md` MUST remove the X01 transition clauses of §7 "Back navigation"
  (N3) and the Sidebar "Dashboard group" note (N2), recording `BackButton`/`backTo`, the
  `onBack(goBack)` contract, the `history.state.idx` criterion and the Dashboard group (with
  canonical order) as current state. The memory note `project_dashboard_cluster_header_nav` is
  updated in this same PR (Analytics/Workload now live in the sidebar group).

### Key Entities *(include if feature involves data)*

Not applicable — no data model change. The only "entities" are UI constructs: the `NavItem`
menu descriptor (gains `collapseIfSingle`) and the `BackButton` component.

## Success Criteria *(mandatory)*

### Measurable Outcomes (the task's acceptance criteria)

- **SC-001**: The menu matches the §1 role table exactly, per role.
- **SC-002**: No menu item leads to a route the logged-in role's guard blocks.
- **SC-003**: `DashboardPage`, `AnalyticsPage` and `InspectorWorkloadPage` render no
  "Analytics"/"Workload"/"Dashboard" header buttons and no "Back"; the rest is byte-for-byte the
  same (the diff only removes header code, imports and comments).
- **SC-004**: The 15 sub-screens each show one header button with icon + "Back" (`aria-label="Back"`)
  before the title; none keeps a "Go back", a text link or a `secondaryActions` "Back" in the header.
- **SC-005**: With history, Back returns to the previous screen; without history, it goes to the
  §4 fallback (per role in `TenantDetailPage`).
- **SC-006**: On create screens with a dirty form, Back opens the discard dialog and does not navigate.
- **SC-007**: `PageHeader` without `backTo` works outside a router; the old `PageHeader.test.tsx`
  cases pass unchanged.
- **SC-008**: In the wizards, the step-back control is "Previous step" with unchanged behaviour;
  each screen has exactly one button named "Back".
- **SC-009**: The Back button is Tab-focusable, fires on Enter and Space, and shows the keyboard
  focus ring.
- **SC-010**: `pnpm --filter web lint` (`--max-warnings 0`), `typecheck` and `test` pass.
- **SC-011**: After a direct-link login, a redirect, or a filter/tab/drawer written with `replace`
  on a directly-opened screen, Back goes to the fallback — never a no-op, never leaving the app
  (L-X01-01).
- **SC-012**: `NAV_ITEMS` and `filterNavItems` are exported; `filterNavItems(NAV_ITEMS, 'AM')`
  compiles; child order follows the canonical table; menu tests run without
  `SidebarSubmenu`/`SidebarItem` mocks (L-X01-02/03).
- **SC-013**: The board keeps "List" and "Map View"; import ignores Back during the commit; the
  `TenantDetailPage` error `EmptyState` takes CL_ADMIN to `/dashboard` with no toast (L-X01-05/06/07).
- **SC-014**: `apps/web/CLAUDE.md` has no N2/N3 transition clauses and the
  `project_dashboard_cluster_header_nav` memory is updated in this PR (L-X01-04).

## Assumptions

- **A-1** (L-X01-01): "App history exists" is decided by `window.history.state.idx` (browser/data
  router), with `location.key !== 'default'` kept only as the memory-router fallback. This is the
  accepted resolution of the previous `key`-only defect and applies to all `useGoBack` consumers,
  including `AppErrorBoundary` (which is otherwise unchanged).
- **A-2** (L-X01-02): `Sidebar.roles.test.tsx` drops the `SidebarSubmenu`/`SidebarItem` mocks and
  renders the real menu under `MemoryRouter` with per-case `initialEntries`; `useAuth`,
  `SidebarUser`, `SidebarUserMenu` stay mocked. `filterNavItems` unit tests live in
  `Sidebar.test.tsx`, which may keep its render mocks.
- **A-3** (L-X01-03): The canonical child order is fixed here; future features insert by position,
  and menu tests assert presence and **relative order by label**, never index or count.
- **A-4** (L-X01-08): Override contracts are `onClick?: (goBack) => void` (`BackButton`) and
  `onBack?: (goBack) => void` (`PageHeader`); create pages keep their own `useGoBack` but share one
  fallback constant with `backTo`. A sub-screen's `backTo` must be reachable by every role that
  opens it, else computed per role.
- **A-5**: X01 is out of the client contract, so there are no `xx.A#` codes to mirror; the
  acceptance criteria are the task's own (SC-001…SC-014).
- **A-6**: No multi-tenant exception applies (no new entity/endpoint/tenant-scoped data). The
  pending product decisions (Q2/Q4/Q6/Q12) are unrelated to this task.
- **A-7**: Depends on TASK-X00-1 being merged (it wrote the §7/Sidebar sections of
  `apps/web/CLAUDE.md` in near-final form with transition clauses). If X01 merged before X00, X00
  would write them already-final and FR-017's clause removal would be a no-op; X00 is merged, so
  FR-017 removes the clauses.
- **A-8**: Out of scope: breadcrumbs, header redesign, a tooltip on Back, new focus management,
  a Back button on the three top-level panel screens, `/notification-consents`, redirect-only
  routes, `AppErrorBoundary`'s own markup, public screens and the PWA, the "Back to X" buttons
  inside `EmptyState` bodies, and `collapseIfSingle` on Users/Configuration.
