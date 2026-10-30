# Phase 0 Research — X01 Dashboard group + Back button

No `NEEDS CLARIFICATION` markers survived the spec. One technical decision carries real risk and
is recorded here; the rest are reuse decisions.

## Decision 1 — "App history exists" detection in `useGoBack` (L-X01-01)

**Decision**: Detect in-app history with `window.history.state?.idx`:
`const idx = window.history.state?.idx; const hasAppHistory = typeof idx === 'number' ? idx > 0 : location.key !== 'default';`
— `navigate(-1)` when true, `navigate(fallbackPath)` otherwise. Keep the `location.key` branch
only as the fallback for routers that do not write `idx` (memory routers in tests).

**Rationale**: React Router 6's data router (`createBrowserRouter`) writes a monotonic
`window.history.state.idx` — `0` for the first entry, preserved by `replace`, incremented by
`push`. That is exactly "did the user reach here by an in-app push?". The previous criterion,
`location.key !== 'default'`, is wrong in RR 6.28 because **every `replace` mints a fresh `key`**;
only the very first entry keeps `'default'`. So after any `replace` (login/redirect via
`<Navigate replace>` and `LoginPage`, URL-filter writes in `useUrlFilters`, drawer close, tab
switch) the old hook saw a non-default key and called `navigate(-1)` — a silent no-op in a fresh
tab, or an exit from the app when the tab came from another site.

**Alternatives considered**:
- *Keep `location.key` only* — rejected: the defect above; it is the whole reason for the task's
  L-X01-01.
- *Inspect `window.history.length`* — rejected: pollutable by unrelated navigations and not reset
  per SPA session; unreliable.
- *Track a custom in-app depth counter in context* — rejected: more moving parts than reading the
  value the data router already maintains, and it would not survive a refresh (the task requires
  the refresh case to keep working, which `idx` does because it is persisted in history state).

**Test consequence**: `createMemoryRouter`/`MemoryRouter` do not write `window.history.state.idx`,
so page/hook tests that must prove "`replace` + Back → fallback" stub `window.history.replaceState({ idx: 0 }, '')`
before render and restore it in `afterEach`. `useGoBack` test G1 uses `createBrowserRouter` (jsdom
writes `idx`) to exercise the real browser path; G4/G5 keep the memory-router `key` fallback.

## Decision 2 — `BackButton` owns the router hook, not `PageHeader` (reuse + testability)

**Decision**: `BackButton` calls `useGoBack(to)` internally; `PageHeader` renders it only when
`backTo` is set.

**Rationale**: `PageHeader` must keep rendering **outside a router** (its existing tests render it
with no router, H1). If `PageHeader` called `useGoBack` unconditionally it would throw without a
router. Isolating the hook in `BackButton` means a router is required only when a Back button is
actually requested.

**Alternatives considered**: putting `useGoBack` in `PageHeader` behind a conditional — rejected:
hooks cannot be called conditionally, and lifting the hook into a child is the idiomatic fix.

## Decision 3 — Menu test arrangement without render mocks (L-X01-02)

**Decision**: `Sidebar.roles.test.tsx` renders the real `SidebarSubmenu`/`SidebarItem` under
`MemoryRouter`, mocking only `useAuth`, `SidebarUser`, `SidebarUserMenu`. `filterNavItems` unit
tests move to `Sidebar.test.tsx`, which may keep render mocks because it never renders the real menu.

**Rationale**: The old mocks replaced those components with role-less, href-less `<div>`s, so the
menu tests could not assert `aria-haspopup`, `href`, `menuitem` or the active indicator — exactly
the behaviours this feature changes and that F02/F05/F07/F08 will re-use. Removing the mocks is what
makes SC-012 testable and is the arrangement the downstream features inherit.

**Alternatives considered**: keeping the mocks and asserting only on `filterNavItems` output —
rejected: it would leave the rendered group's roles/href/active behaviour unverified, the regression
surface the downstream features depend on.

## Decision 4 — Reuse everything else

`ConfirmDialog` (discard flow), `ListFilterTableTemplate` (list screens), the existing focus-ring
utility classes, and the `mdi-arrow-left` icon are reused unchanged. No new dependency is added.
`collapseIfSingle` is a single new optional field on `NavItem`, used only by the Dashboard group.
