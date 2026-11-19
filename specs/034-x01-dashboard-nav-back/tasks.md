# Tasks: Dashboard Sidebar Group and Standard Back Button (X01)

**Input**: Design documents from `/specs/034-x01-dashboard-nav-back/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: INCLUDED — TDD is mandatory for this repo (constitution §III). Every implementation task
is preceded by its red test task.

**Organization**: by user story. US1 (menu) and US2 (Back button) are both P1; US3 (dashboard
headers) is P2. US1 and US2's primitive stack are independent; US3 depends on US1 being the new nav
path; the sub-screen wiring tasks depend on US2's primitive stack.

All paths are under `apps/web/src/` unless noted. `[P]` = different files, no dependency on an
incomplete task.

## Phase 1: Setup

- [X] T001 Worktree created from `origin/develop`; `pnpm install`, `prisma generate`, `@properfy/shared`
  and `@properfy/frontend-standards` builds, and baseline `web typecheck` + `web lint` all PASS
  (delegated). No further setup needed — web-only task, no new dependency.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The corrected `useGoBack` hook underpins every Back button and `AppErrorBoundary`.
It is the one piece both the primitive (`BackButton`) and all 15 sub-screens depend on.

- [ ] T002 In `hooks/useGoBack.test.tsx`, write G1–G5 red (L-X01-01): G1 `createBrowserRouter` in
  jsdom, after `window.history.replaceState(null,'','/detail')` the component does
  `navigate('/detail?x=1',{replace:true})` → click → fallback `/list`; G2 stub `history.state={idx:0}`
  with a random (post-`replace`) key → fallback; G3 `history.state={idx:2}` → `navigate(-1)`; G4 memory
  router `/list`→push `/detail` → back to `/list` (key fallback); G5 memory initial `/detail` →
  fallback. Restore `window.history.state` in `afterEach` (`replaceState(null,'','/')`).
- [ ] T003 Implement the `history.state.idx` criterion in `hooks/useGoBack.ts`
  (`const idx = (window.history.state as {idx?:unknown}|null)?.idx; const hasAppHistory = typeof idx === 'number' ? idx > 0 : location.key !== 'default';`),
  update the JSDoc to describe the `idx` criterion and the `key` memory-router fallback; keep the
  signature and dep array (`[location.key, navigate, fallbackPath]`). G1–G5 green.

---

## Phase 3: User Story 1 — Dashboard sidebar group (Priority: P1)

**Goal**: One "Dashboard" menu group (Overview/Analytics/Workload) with canonical order,
`collapseIfSingle`, and exported `NAV_ITEMS`/`filterNavItems`.

**Independent test**: render the sidebar per role; assert children by label + relative order,
guard-aligned routes, and the collapse-to-plain-item behaviour.

- [ ] T004 [US1] In `components/shell/Sidebar.test.tsx`, add `filterNavItems` unit tests F1–F6 over the
  (to-be) exports `NAV_ITEMS`/`filterNavItems`; keep the existing render mocks here. Red.
- [ ] T005 [US1] In `components/shell/Sidebar.roles.test.tsx`, **remove the `SidebarSubmenu`/`SidebarItem`
  mocks** (`:12-30`), keep `useAuth`/`SidebarUser`/`SidebarUserMenu` mocks, render under `MemoryRouter`
  with per-case `initialEntries`; write S1–S9 (group `aria-haspopup`, menuitems by label + href, CL
  roles exclude Workload, INSP plain link, active indicator on `/analytics` & `/inspector-workload`,
  Users/Configuration regression, relative order); remove the old "does not show Analytics/Workload"
  / "Dashboard single entry" cases and the `:139-141` comment. Red.
- [ ] T006 [US1] In `components/shell/Sidebar.tsx`: add `collapseIfSingle?: boolean` to `NavItem`;
  replace the flat Dashboard item (`:28-32`) with the group (canonical submenu Overview/Analytics/
  Workload, roles mirroring the guards); implement the `filterNavItems` collapse rule (0→drop,
  1+flag→plain item, ≥2→group, no-flag unchanged); **export** `NAV_ITEMS` and `filterNavItems` and make
  the 3rd param optional (`clUserPermissions?: string[]`); update the `:29-31` comment to record the
  canonical child order. F1–F6 and S1–S9 green.

---

## Phase 4: User Story 2 — Standard Back button (Priority: P1)

**Goal**: One header Back button on every sub-screen, correct history/fallback/override behaviour.

**Independent test**: per screen, exactly one "Back" before the heading; direct entry → fallback;
in-app push → previous route; dirty create → discard dialog.

### Primitive stack (blocks the per-screen wiring below)

- [ ] T007 [US2] Create `components/layout/BackButton.test.tsx` with `createMemoryRouter` +
  `RouterProvider` and stub routes `/list`/`/detail`; write B1–B7 (fallback, history, query-preserving
  fallback, `onClick` spy receives a function and does not navigate, `onClick` calling the received
  `goBack` navigates to fallback, role/name/type + `aria-hidden` icon, Enter and Space activate). Red.
- [ ] T008 [US2] Create `components/layout/BackButton.tsx` (`to`, `onClick?: (goBack)=>void`,
  `className?`): `<button type="button" aria-label="Back">` + `<i class="mdi mdi-arrow-left text-xl" aria-hidden>`
  + `<span>Back</span>`, state classes per spec, focus ring; calls `useGoBack(to)`; with `onClick`
  present, calls only `onClick(goBack)`. Export it from `components/layout/index.ts`. B1–B7 green.
- [ ] T009 [US2] In `components/layout/PageHeader.test.tsx` write/adjust H1–H5 (no router + no `backTo`
  → no Back and no throw; `backTo` → Back before heading via `compareDocumentPosition`; `onBack` spy
  gets a function, no navigation; `onBack` without `backTo` → no Back; existing primary/secondary/FAB
  cases stay green, primary CTA via `getAllByRole`). Red for the new cases.
- [ ] T010 [US2] Extend `components/layout/PageHeader.tsx` with `backTo?: string` and
  `onBack?: (goBack)=>void`: wrap `<h1>` as `<div class="flex items-center gap-3"><BackButton/><h1/></div>`
  only when `backTo` is set; no router hook otherwise; `onBack` ignored without `backTo`. Add
  `backTo?: string` passthrough to `components/layout/templates/ListFilterTableTemplate.tsx`. H1–H5 green.

### Appointments (P4)

- [ ] T011 [P] [US2] `appointments/pages/AppointmentListPage.tsx` + test: `ListFilterTableTemplate backTo="/map"`;
  keep Import/Board/Map View/Generate Excel; test P-a/P-b (direct entry, `history.state.idx` stub 0,
  change a filter → Back → `/map`)/P-c.
- [ ] T012 [P] [US2] `appointments/pages/AppointmentBoardPage.tsx` + test: `PageHeader backTo="/appointments"`;
  keep "List" and "Map View" in `secondaryActions` (L-X01-05); P-a/P-b/P-c.
- [ ] T013 [US2] `appointments/pages/AppointmentImportPage.tsx` + test: `PageHeader backTo="/appointments"`;
  remove the top `<Link>` "Back to Appointments" (keep CSV template link); rename the step buttons
  (`~:253`, `~:296`) to "Previous step" (same handlers); `onBack={(goBack)=>{ if(!isCommitting) goBack(); }}`
  (L-X01-06); update existing step-button tests; add the commit-ignores-Back case.
- [ ] T014 [US2] `appointments/pages/AppointmentDetailPage.tsx` + test: `BackButton` in the own header
  (replace the "Go back" button) + `backTo="/appointments"` on loading/error states; swap
  `getByLabelText('Go back')` for `getByRole('button',{name:'Back'})`; drop `handleBack` if now unused.

### Properties, contacts, service groups (P5)

- [ ] T015 [P] [US2] `properties/pages/PropertyCreatePage.tsx` + test: single `const BACK_TO='/properties'`
  for both `useGoBack(BACK_TO)` and `PageHeader backTo={BACK_TO}` + `onBack={handleBack}` (dirty →
  discard dialog, no navigation; Discard navigates); `forceBack` keeps the page `goBack` (L-X01-08).
- [ ] T016 [P] [US2] `properties/pages/PropertyDetailPage.tsx` + test: `BackButton` in the own header +
  `backTo="/properties"` on states; replace "Go back"; keep the `EmptyState` "Back to Properties".
- [ ] T017 [P] [US2] `contacts/pages/ContactDetailPage.tsx` + test: `BackButton` own header,
  `/contacts`; keep `EmptyState` "Back to Contacts".
- [ ] T018 [P] [US2] `service-groups/pages/ServiceGroupListPage.tsx` + test:
  `ListFilterTableTemplate backTo="/map?mode=groups"` (assert `search==='?mode=groups'`); keep "Map View".
- [ ] T019 [US2] `service-groups/pages/ServiceGroupCreatePage.tsx` + test: single `BACK_TO='/service-groups'`
  for `useGoBack`/`backTo`; `onBack={handleNavigateBack}`; rename the step-2 button (`~:337`) to
  "Previous step" (handler unchanged); step-1 "Cancel" stays; update `~:264`/`~:271` tests.
- [ ] T020 [P] [US2] `service-groups/pages/ServiceGroupDetailPage.tsx` + test: `BackButton` own header +
  `backTo="/service-groups"` on states; replace "Go back".

### Tenants, integrations, settings, invoices (P6)

- [ ] T021 [US2] `tenants/pages/TenantDetailPage.tsx` + test: `PageHeader backTo` computed per role
  (`/tenants` for AM/OP, `/dashboard` for CL_ADMIN); the error `EmptyState` uses `navigate(backTo)`
  with "Back to Agencies" (AM/OP) / "Back to Dashboard" (CL_ADMIN); remove the fixed `handleBack`
  (L-X01-07); tests for all three roles incl. the no-toast CL_ADMIN path.
- [ ] T022 [P] [US2] `integrations/pages/IntegrationDetailPage.tsx` + test: `BackButton` replaces the
  text link; fallback `/integrations`.
- [ ] T023 [P] [US2] `integrations/pages/FyIntegrationPage.tsx` + NEW `FyIntegrationPage.test.tsx`:
  `BackButton` replaces the text link; fallback `/integrations?tab=api-keys` (assert search); mock
  `ApiKeysTab`.
- [ ] T024 [P] [US2] `settings/pages/AccountSettingsPage.tsx` + test: `PageHeader backTo="/dashboard"`;
  direct entry (`history.state.idx` stub 0), switch to Security tab (`replace`) → Back → `/dashboard`.
- [ ] T025 [P] [US2] `financial/pages/InvoicesPage.tsx` + test:
  `ListFilterTableTemplate backTo="/financial/entries"`; P-a/P-b/P-c.

---

## Phase 5: User Story 3 — Dashboard headers lose cluster buttons (Priority: P2)

**Goal**: Remove in-header cross-navigation from the three frozen panel screens; nothing else changes.

**Independent test**: per role, no "Analytics"/"Workload"/"Dashboard" header button, no "Back";
"New Appointment"/`WeekSelector`/charts intact.

- [ ] T026 [P] [US3] `features/dashboard/pages/DashboardPage.tsx` + test: remove `canViewAnalytics`,
  `canViewWorkload`, `secondaryActions` and the `PageHeader secondaryActions` prop (keep
  `primaryAction` "New Appointment"); drop now-unused imports; tests D1–D5.
- [ ] T027 [P] [US3] `features/analytics/pages/AnalyticsPage.tsx` + test: remove the `secondaryActions`
  (`:51-58`) and the `useNavigate`/`usePermissions`/`UserRole` usages + the `:48-50` comment; tests A1–A3.
- [ ] T028 [P] [US3] `features/inspector-workload/pages/InspectorWorkloadPage.tsx` + test: remove
  `secondaryActions` (`:35-42`) and the `useNavigate` usage; keep `WeekSelector` as `children`; tests W1–W3.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T029 [P] Doc (L-X01-04): in `apps/web/CLAUDE.md` remove the N2 transition clause ("The group is
  introduced by X01; until it merges…") and the N3 transition clause ("`BackButton` and `backTo` are
  introduced by X01. Until X01 merges…"); keep the final-state text (group + canonical order,
  `BackButton`/`backTo`, `onBack(goBack)`, `history.state.idx`).
- [ ] T030 [P] Update the memory note `project_dashboard_cluster_header_nav` (main repo memory dir):
  Analytics/Workload now live in the sidebar Dashboard group; cluster header buttons removed.
- [ ] T031 Run the full web gate inside the worktree (`@properfy/shared` + `@properfy/frontend-standards`
  build, `web typecheck` clean, `web lint --max-warnings 0`, `web test`) and `git diff --stat
  origin/develop... | tail -1` (≤150). Via a subagent returning a condensed pass/fail summary.
- [ ] T032 Manual smoke per quickstart.md (P7.2), AM/CL_ADMIN/INSP.

---

## Dependencies

- T002→T003 (Foundational) block every Back button (T007–T025) and are independent of US1 (T004–T006).
- US1 (T004–T006) is independent; may run in parallel with the Foundational phase.
- US2 primitive stack T007→T008 and T009→T010 block the per-screen tasks T011–T025.
- US3 (T026–T028) depends on US1 being the new nav path (logical, not code) — safe after T006.
- Polish T029–T032 last; T031/T032 after all implementation.

## Parallel opportunities

- T004/T005 (two test files) can be written in parallel; T011–T025 marked `[P]` touch distinct
  page+test file pairs (except T013/T014 and T019/T021, which have extra wizard/role logic — keep
  sequential within their group). T026–T028 are fully parallel. T029/T030 parallel.

## MVP

US1 alone (T004–T006) is a shippable increment (the menu group), but the task is one PR: all phases
ship together.
