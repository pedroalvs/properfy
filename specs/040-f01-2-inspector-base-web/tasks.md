# Tasks: Web — Inspector base address & app adoption

**Feature**: `040-f01-2-inspector-base-web` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
**Workspace**: `apps/web` (consumes `@properfy/shared`) | **Tests**: TDD mandatory (Constitution III)

Scope confirmed 2026-10-30 (spec Clarifications): the create/edit **drawer** Base Address section is shipped by F01-1 and is **out of scope**. F01-2 = table App/Push/Last seen columns + "No base address" badge + filter (US1), and detail "Base address" + "App adoption" sections (US2). No backend, migration, or `api-types.ts` change; `InspectorFormDrawer.tsx`, `useInspectorSave.ts`, and `lib/address.ts` are not touched.

## Phase 1: Setup

- [x] T001 Confirm baseline is green in the worktree: `pnpm --filter @properfy/shared build && pnpm --filter @properfy/frontend-standards build && pnpm --filter web typecheck && pnpm --filter web lint` (already verified green; re-confirm if anything changed).

## Phase 2: Foundational (blocking prerequisites for all stories)

- [x] T002 [P] Extend the inspector view-model types with the F01-1 read fields used by the list and detail — `baseLat`, `baseGeocodedAt`, `appInstalledAt`, `appLastSeenAt`, `pushEnabled`, `appVersion` (and the list-only `address` already present on `InspectorDetail`) — plus the `missingBaseAddress` filter field on `InspectorFiltersState`/`DEFAULT_FILTERS`, in `apps/web/src/features/inspectors/types/index.ts`. Source types from `@properfy/shared`/`api-types.ts`; no `as any` (memory WEB-10).

**Checkpoint**: view-model types compile; both stories can be built independently.

## Phase 3: User Story 1 — App adoption columns + "No base address" filter (P1) 🎯 MVP

**Goal**: Table shows App/Push/Last seen and a "No base address" badge; a filter lists inspectors without a base.
**Independent test**: Render table fixtures per adoption state; toggle filter → `missingBaseAddress=true`.

### Tests first (write failing, then implement)

- [x] T003 [US1] Component tests in `apps/web/src/features/inspectors/components/InspectorTable.test.tsx`: App "Installed"/"—"; Push "On"/"Off"/"—"; Last seen relative + Sydney absolute tooltip (TZ pinned away from Sydney, memory "TZ pin") + "Never"/"Just now"; "No base address" badge with both tooltips decided from the item's `address` (L-F01-07); tooltips "last device seen" (Push), "any device" (App, "Installed on {date}"), "reported at most every 6 h" (Last seen); sort with nulls last; deactivated `pushEnabled:false` → "Off".
- [x] T004 [P] [US1] Filter test in `apps/web/src/features/inspectors/components/InspectorFilters.test.tsx`: the "No base address" toggle calls `onFiltersChange({missingBaseAddress:true})` and reflects the active state.
- [x] T005 [P] [US1] Hook test in `apps/web/src/features/inspectors/hooks/useInspectorList.test.ts`: filter → `?missingBaseAddress=true`; absent when false.
- [x] T006 [P] [US1] Page test in `apps/web/src/features/inspectors/pages/InspectorListPage.test.tsx`: active-filter empty state "No inspectors without a base address."

### Implementation

- [x] T007 [US1] Add App/Push/Last seen columns (after `status`, client-side sortable, nulls last) and the "No base address" badge (text + warning color) to `apps/web/src/features/inspectors/components/InspectorTable.tsx`, reusing the existing Sydney/relative date helper from `apps/web/src/lib` and the tooltip primitive; sortable `<th>`. (make T003 pass)
- [x] T008 [P] [US1] Add the "No base address" toggle to `apps/web/src/features/inspectors/components/InspectorFilters.tsx`. (make T004 pass)
- [x] T009 [P] [US1] Map `missingBaseAddress` to the query param in `apps/web/src/features/inspectors/hooks/useInspectorList.ts` (absent when false); keep derived returns inside the existing `useMemo` (web CLAUDE.md §11). (make T005 pass)
- [x] T010 [US1] Add the active-filter empty state to `apps/web/src/features/inspectors/pages/InspectorListPage.tsx`. (make T006 pass)

**Checkpoint**: US1 independently testable — adoption columns, badge, and filter work.

## Phase 4: User Story 2 — Base address & app adoption in the detail view (P2)

**Goal**: Detail shows "Base address" (location status) and "App adoption" sections with fallbacks; never raw coordinates.
**Independent test**: Render `InspectorDetailSections` fixtures (located/not-located/not-set; full/empty adoption).

### Tests first

- [x] T011 [US2] Component tests in `apps/web/src/features/inspectors/components/InspectorDetailSections.test.tsx` (and `__tests__/InspectorDetailSections.test.tsx` if that is where detail cases live): "Base address" with "Located"/"Could not be located"/"Not set"; "App adoption" values + fallbacks; never-opened app shows all fallbacks; `appVersion` `0.1.0+ab12cd3` shown as-is; "Last device seen" caption; Last seen tooltip "reported at most every 6 h"; deactivated `pushEnabled:false` → "Off"; no coordinate anywhere in the DOM.

### Implementation

- [x] T012 [US2] Add the "Base address" section (after Personal Details) and "App adoption" section (after Workload) to `apps/web/src/features/inspectors/components/InspectorDetailSections.tsx`, reusing `FormSection`/`DetailRow`, the Sydney date helper and the tooltip primitive; no raw coordinates. (make T011 pass)

**Checkpoint**: US2 independently testable — detail shows both sections with fallbacks.

## Phase 5: Polish & Cross-Cutting

- [x] T013 [P] Add the Playwright e2e spec `apps/web/tests/e2e/inspector-base-address.spec.ts` (API stubbed): (1) list shows App/Push/Last seen for a stubbed inspector; (2) "No base address" filter lists only inspectors without coords; (3) opening the detail shows "Base address … Located" and the "App adoption" section.
- [x] T014 Update `apps/web/CLAUDE.md` per Phase 2 rule (CLAUDE.md §13.11): record the inspector table App/Push/Last seen columns + "No base address" badge/filter and the detail "Base address" + "App adoption" sections added by F01-2 (and that the drawer, owned by F01-1, is unchanged).
- [ ] T015 Run the full worktree gate (condensed, via subagent): `pnpm --filter @properfy/shared build && pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test` all green, then the e2e spec green. Clear `apps/web` `tsbuildinfo` if typecheck looks stale (memory).
- [ ] T016 Manual QA in the browser (AM/OP, `/inspectors`) per `quickstart.md` (table columns/badge/filter + detail sections). Drawer base-address QA is F01-1's; re-run lightly only to confirm no regression.

## Dependencies & Execution Order

- **Phase 1 (T001)** → **Phase 2 (T002)** → stories.
- **US1 (P1, MVP)** depends only on T002. Tests T003–T006 before impl T007–T010.
- **US2 (P2)** depends only on T002. T011 before T012. US1 and US2 are independent of each other.
- **Polish** after the stories it exercises (T013 touches US1+US2 flows; T014–T016 close out).
- Merge-order note (not a task): a later F05-3 also edits `InspectorListPage.tsx` and the detail drawer (L-F05-14); whichever merges second rebases and keeps both.

## Parallel Opportunities

- After T002: US1 and US2 test-writing proceed in parallel (different files).
- Within US1: T004, T005, T006 are `[P]` (different files); T008, T009 are `[P]`; T003/T007 share the table.
- T013 `[P]` can be drafted alongside detail work but must run after all impl.

## Implementation Strategy

- **MVP = User Story 1** (adoption columns + "No base address" filter) — fulfils acceptance criterion 3 and is the primary operator surface.
- Deliver US1 → US2 incrementally; each is an independently testable slice.
- TDD throughout: write the listed test task red, implement to green, refactor.

## Format validation

All tasks use `- [ ] [TaskID] [P?] [Story?] Description with file path`. Setup/Foundational/Polish carry no story label; US phases carry `[US1]/[US2]`.
