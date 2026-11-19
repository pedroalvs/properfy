# Tasks: Inspector notices — Web (AM/OP)

**Feature**: 045-f02-2-notices-op-screen | **Branch**: `045-f02-2-notices-op-screen`
**Input**: spec.md, plan.md, research.md, data-model.md, contracts/README.md, quickstart.md

TDD is mandatory (constitution §III): every component/hook/lib is written test-first against
the acceptance tables in spec.md. All paths are relative to repo root; new feature code lives
under `apps/web/src/features/inspector-notices/`. The backend contract (F02-1) and
`api-types.ts` are already on `develop` — **do not** touch backend or regenerate the contract.

## Phase 1: Setup

- [ ] T001 Confirm shared build + web baseline green in the worktree: `pnpm --filter @properfy/shared build && pnpm --filter web typecheck && pnpm --filter web lint` (baseline already PASS; re-confirm before writing code).
- [ ] T002 Create the feature folder skeleton and barrel in `apps/web/src/features/inspector-notices/index.ts` and `apps/web/src/features/inspector-notices/types/index.ts` (re-export the shared `InspectorNoticeSummary`/`Detail`/`PublishInspectorNoticeInput` types and declare any web-local view-model types).

## Phase 2: Foundational (blocking prerequisites)

- [ ] T003 [P] Write tests for the audience label mapper in `apps/web/src/features/inspector-notices/lib/format-audience.test.ts` (ALL→"All active inspectors", SELECTED→"N selected inspectors", REGION→"Region: {name}", SYSTEM→"Automatic").
- [ ] T004 Implement `apps/web/src/features/inspector-notices/lib/format-audience.ts` to pass T003.
- [ ] T005 [P] Write tests for the critical ConfirmDialog copy builder in `apps/web/src/features/inspector-notices/lib/critical-confirm-copy.test.ts` (base vs critical body; "Up to N inspector(s) may receive an SMS." incl. singular; no-number fallback when `audienceSize` is null; Sydney night-time phrase at 21:00/06:59 ON and 20:59/07:00 OFF with injected `now`; non-critical shows neither) — pins `TZ` away from Sydney.
- [ ] T006 Implement `apps/web/src/features/inspector-notices/lib/critical-confirm-copy.ts` (pure fn of `{critical, audienceSize, now}` using the shared Sydney display-timezone helper) to pass T005.

## Phase 3: User Story 1 — Publish a notice (Priority: P1) 🎯 MVP

**Goal**: AM/OP open the drawer, write a notice, choose an audience, optionally mark critical,
confirm (with SMS-ceiling/night-time copy), and publish idempotently.

**Independent test**: with the POST + option endpoints stubbed, publishing a valid notice for
each audience sends one `POST /v1/inspector-notices` with a stable `Idempotency-Key` and shows
the success snackbar; errors map to the drawer InfoBanner.

- [ ] T007 [P] [US1] Write tests for `useActiveInspectorOptions` in `.../hooks/useActiveInspectorOptions.test.ts` (paginates `GET /v1/inspectors?status=ACTIVE&pageSize=100` to `totalPages`; sorted by name; error state).
- [ ] T008 [P] [US1] Write tests for `useActiveInspectorCount` in `.../hooks/useActiveInspectorCount.test.ts` (`pageSize=1`, reads `pagination.total`; only enabled for Audience "All"; failure → null, no throw).
- [ ] T009 [P] [US1] Write tests for `useActiveRegionOptions` in `.../hooks/useActiveRegionOptions.test.ts` (`GET /v1/service-regions?status=ACTIVE&pageSize=100`; options expose `inspectorCount`; error state).
- [ ] T010 [P] [US1] Write tests for `usePublishInspectorNotice` in `.../hooks/usePublishInspectorNotice.test.ts` (POST with body + `Idempotency-Key` header; maps each contract error code off status/envelope; invalidates `['inspector-notices']` on success).
- [ ] T011 [US1] Implement the three option hooks (`useActiveInspectorOptions`, `useActiveInspectorCount`, `useActiveRegionOptions`) in `.../hooks/` to pass T007–T009.
- [ ] T012 [US1] Implement `usePublishInspectorNotice` in `.../hooks/usePublishInspectorNotice.ts` (openapi-fetch, no `as any`; error mapping per contracts/README.md) to pass T010.
- [ ] T013 [P] [US1] Write tests for `InspectorMultiSelect` in `.../components/InspectorMultiSelect.test.tsx` (loads all pages; search by name/email; select-all-shown/clear; "N selected"; >500 cap error; keyboard: Tab to search, Space toggles; load error + Retry).
- [ ] T014 [P] [US1] Write tests for `RegionSelect` in `.../components/RegionSelect.test.tsx` (options "{name} ({inspectorCount} inspectors)"; 0-inspector warning; load error + Retry).
- [ ] T015 [US1] Implement `InspectorMultiSelect` in `.../components/InspectorMultiSelect.tsx` to pass T013.
- [ ] T016 [US1] Implement `RegionSelect` in `.../components/RegionSelect.tsx` to pass T014.
- [ ] T017 [US1] Write tests for `NewInspectorNoticeDrawer` in `.../components/NewInspectorNoticeDrawer.test.tsx` covering the full acceptance table in spec.md (required fields, counters incl. over-limit, audience-empty errors, non-critical vs critical ConfirmDialog copy, SMS ceiling for ALL/REGION/SELECTED + fallback, night/day time phrase + boundaries, lock-screen hint via `aria-describedby`, payload + stable `Idempotency-Key` on retry, fresh key on reopen, 422/400/422 error mapping incl. unchecking invalid ids, success snackbar + close + invalidate, discard-confirm). Success-path assertions use `waitFor`.
- [ ] T018 [US1] Implement `NewInspectorNoticeDrawer` in `.../components/NewInspectorNoticeDrawer.tsx` (controlled form per the web convention, payload validated against `publishInspectorNoticeSchema`; `DrawerPanel`, `ConfirmDialog`, `InfoBanner`, `useSnackbar`; `Idempotency-Key` lifecycle; focus management/Esc) to pass T017.

## Phase 4: User Story 2 — Review history & read receipts (Priority: P2)

**Goal**: AM/OP browse the list (Active/Archived/All), open a notice to see read receipts with
accessibility chips, and archive idempotently.

**Independent test**: with the list + detail + archive endpoints stubbed, the list renders the
contract columns/counts/states, the detail shows "Read by X of Y (…)" with chips, and Archive
posts and reflects the archived state.

- [ ] T019 [P] [US2] Write tests for `useInspectorNoticeList` in `.../hooks/useInspectorNoticeList.test.ts` (paginated query; `status` filter resets to page 1).
- [ ] T020 [P] [US2] Write tests for `useInspectorNoticeDetail` in `.../hooks/useInspectorNoticeDetail.test.ts` (fetch by `params.path`; 404 surfaced).
- [ ] T021 [P] [US2] Write tests for `useArchiveInspectorNotice` in `.../hooks/useArchiveInspectorNotice.test.ts` (POST archive; idempotent 200; invalidates list + detail).
- [ ] T022 [US2] Implement `useInspectorNoticeList`, `useInspectorNoticeDetail`, `useArchiveInspectorNotice` in `.../hooks/` to pass T019–T021.
- [ ] T023 [P] [US2] Write tests for `InspectorNoticeTable` in `.../components/InspectorNoticeTable.test.tsx` (columns, Critical chip, audience text, X/Y, Status chip, clickable+focusable row → `navigate('/inspector-notices/:id')`).
- [ ] T024 [US2] Implement `InspectorNoticeTable` in `.../components/InspectorNoticeTable.tsx` to pass T023.
- [ ] T025 [US2] Write tests for `InspectorNoticeListPage` in `.../pages/InspectorNoticeListPage.test.tsx` (rows, author System/user, SELECTED/SYSTEM labels, filter→`status=archived&page=1`, empty active/archived, error+Retry, loading, row navigation).
- [ ] T026 [US2] Implement `InspectorNoticeListPage` in `.../pages/InspectorNoticeListPage.tsx` (`ListFilterTableTemplate` + `FilterSegmented` + `DataTablePagination`; "New notice" opens the drawer) to pass T025 and wire the US1 drawer.
- [ ] T027 [US2] Write tests for `InspectorNoticeDetailPage` in `.../pages/InspectorNoticeDetailPage.test.tsx` (header + chips + Back fallback `/inspector-notices` as OP, meta, pre-wrap body no-HTML, "Read by X of Y" + progressbar aria, recipient table unread-first, L-F02-09 "(Z can't read in the app)" + Inactive/No-app-access chips incl. read-inactive excluded from Z and Z=0 case, All/Read/Unread client tabs, archive confirm→snackbar→InfoBanner→button gone, archived has no Archive, 404 EmptyState, error+Retry).
- [ ] T028 [US2] Implement `InspectorNoticeDetailPage` in `.../pages/InspectorNoticeDetailPage.tsx` (`PageHeader backTo="/inspector-notices"`, progressbar, tabs, recipient table with chips, archive `ConfirmDialog`) to pass T027.

## Phase 5: User Story 3 — Navigation & access control (Priority: P3)

**Goal**: AM/OP reach the screen from the Sidebar Dashboard group; other roles can't, and the
routes deny them.

**Independent test**: Sidebar role tests show the item for AM/OP in canonical order and hide it
for CL/INSP; router tests allow AM/OP and deny CL_ADMIN/CL_USER/INSP.

- [ ] T029 [US3] Update `apps/web/src/components/shell/Sidebar.roles.test.tsx` (N1/N2/N3): "Inspector notices" `href="/inspector-notices"` in the Dashboard flyout for AM/OP between Live Day (if merged, else Overview) and Analytics — assert by label and order relative to Analytics, never index/count; CL_ADMIN/CL_USER unchanged; INSP plain "Dashboard"; render with `MemoryRouter`, no `SidebarSubmenu`/`SidebarItem` mocks.
- [ ] T030 [US3] Add the "Inspector notices" child to the Dashboard `submenu` in `apps/web/src/components/shell/Sidebar.tsx` (`{ icon: 'mdi-bullhorn-outline', label: 'Inspector notices', to: '/inspector-notices', roles: [UserRole.AM, UserRole.OP] }`) between Overview and Analytics — append only, no reorder — to pass T029.
- [ ] T031 [US3] Update the routing test (`apps/web/src/app/router.test.tsx` or the existing route-guard test) so `/inspector-notices` and `/inspector-notices/:noticeId` render for AM/OP and deny CL_ADMIN/CL_USER/INSP.
- [ ] T032 [US3] Register the two routes under the authenticated layout in `apps/web/src/app/router.tsx` with `AuthGuard roles={[UserRole.AM, UserRole.OP]}` (lazy-load the pages; the Dashboard group stays active on `/inspector-notices/*`) to pass T031.

## Phase 6: Polish & Cross-Cutting

- [ ] T033 Update the F01-2 "Push" tooltip copy to D10 (On → "Push is on for at least one of the inspector's devices", Off → "No device has push turned on", "—" → "No data yet") at both sites — `apps/web/src/features/inspectors/components/InspectorTable.tsx` (the `<Tooltip label="Browser notification permission on the last device seen">` at ~L105, made conditional on `pushEnabled`) and the "Push notifications" field in `apps/web/src/features/inspectors/components/InspectorDetailSections.tsx` (~L216–223) — and update their tests `apps/web/src/features/inspectors/components/InspectorTable.test.tsx` (the "last device seen" assertion at ~L207) and any detail-section test asserting the old copy.
- [ ] T034 Update `apps/web/CLAUDE.md` with the new feature folder, the `/inspector-notices` + `/inspector-notices/:noticeId` routes, the Sidebar Dashboard child, and the F01-2 tooltip copy change (Phase 2 CLAUDE.md rule §13.11).
- [ ] T035 Full verification inside the worktree: `pnpm --filter @properfy/shared build && pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test`, then `CI=1` web E2E suite to prove no regression; run typecheck clean (incremental cache can lie). Confirm `git status --porcelain` shows no diff in `openapi.json`/`api-types.ts`.

## Dependencies & order

- Phase 1 → Phase 2 → US1 → US2 → US3 → Polish (list page T026 wires the US1 drawer, so US2 depends on US1).
- `[P]` tasks within a phase touch distinct files and may run together; each implementation task follows its own test task (TDD).
- US3 (Sidebar/router) is independent of US1/US2 logic but ships in the same PR; it can be done in parallel with US1/US2 implementation.

## Parallel example (US1 tests)

```
T007, T008, T009, T010 (hook tests) in parallel →
T013, T014 (component tests) in parallel →
then implementations T011, T012, T015, T016, T018.
```

## MVP scope

User Story 1 (publish) + the list page shell is the minimum demonstrable slice; US2 (receipts
+ archive) and US3 (nav/guard) complete the feature. All three ship in one PR (≤150 files;
~34 files estimated).
