---
description: "Task list for Frontend App Shell & UX Patterns gap closure"
---

# Tasks: Frontend App Shell & UX Patterns

**Input**: Design documents from `/specs/014-frontend-app-shell-ux/`
**Prerequisites**: plan.md (required), spec.md (required for user stories)
**Tests**: Included — component tests with Vitest + @testing-library/react.

**Organization**: Tasks are grouped by gap (equivalent to user stories for Phase 2 work). Phase 1 shell is already complete — this task list covers only the Phase 2 gap closure.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which gap this task belongs to (GAP-001 through GAP-008)
- Include exact file paths in descriptions

## Path Conventions

- Web: `apps/web/src/components/`, `apps/web/src/features/`, `apps/web/src/hooks/`
- Tests: `apps/web/src/components/**/__tests__/`, `apps/web/src/features/**/__tests__/`
- Styles: `apps/web/src/styles/`

---

## Phase 1: Verification (Existing Infrastructure)

**Purpose**: Confirm Phase 1 shell components are functional before gap work.

- [ ] T001 Run `pnpm --filter web test` to verify all 220+ existing component tests pass.
- [ ] T002 Run `pnpm --filter web typecheck` to confirm TypeScript compilation is clean.

**Checkpoint**: Baseline green. Gap implementation can begin.

---

## Phase 2: GAP-001 — Map Integration (Priority: HIGH, blocks 016)

**Goal**: Replace the MapContainer placeholder with real Mapbox GL JS rendering.

**Independent Test**: Open any map page. Verify the map renders tiles, responds to zoom/pan, and displays markers when data is provided.

### Implementation

- [x] T003 [GAP-001] Replace placeholder content in `apps/web/src/components/map/MapContainer.tsx` with real `mapboxgl.Map` initialization using `VITE_MAPBOX_TOKEN` from environment. Handle missing token gracefully (show error message instead of crash). *(Delivered)*
- [x] T004 [GAP-001] Wire `MapMarker` component to create real `mapboxgl.Marker` instances on the map in `apps/web/src/components/map/MapMarker.tsx`. Handle marker cleanup on unmount. *(Delivered)*
- [x] T005 [GAP-001] Wire `MapPopup` component to create real `mapboxgl.Popup` instances in `apps/web/src/components/map/MapPopup.tsx`. Handle popup cleanup on unmount. *(Delivered)*
- [ ] T006 [GAP-001] Add `VITE_MAPBOX_TOKEN` to `apps/web/.env.example` with documentation comment.
- [x] T007 [GAP-001] Enable the 3 map routes in `apps/web/src/app/router.tsx` — remove the `Navigate` redirects for `/appointments/map`, `/properties/map`, `/service-groups/map` and point them to actual map page components. *(Delivered)*
- [x] T008 [P] [GAP-001] Update `apps/web/src/components/map/__tests__/MapContainer.test.tsx` — test that map initializes when token is present and shows error when missing. Mock `mapboxgl.Map`. *(Delivered)*
- [x] T009 [P] [GAP-001] Update `apps/web/src/components/map/__tests__/MapMarker.test.tsx` — test marker creation and cleanup. *(Delivered)*

**Checkpoint**: Map pages render real Mapbox tiles. Service region, appointment, and property maps are navigable.

---

## Phase 3: GAP-003 — URL-Persisted Filter State (Priority: MEDIUM)

**Goal**: Filters persist in the URL so operators don't lose filter context on navigation.

**Independent Test**: Apply filters on the appointments list, copy the URL, open in a new tab — filters are restored.

### Implementation

- [x] T010 [GAP-003] Create shared `useUrlFilters` hook in `apps/web/src/hooks/useUrlFilters.ts` using React Router `useSearchParams`. Accept a schema of filter keys with types and defaults. Return `[filters, setFilter, clearFilters]`. *(Delivered)*
- [x] T011 [P] [GAP-003] Write tests for `useUrlFilters` in `apps/web/src/hooks/__tests__/useUrlFilters.test.ts` — test serialization, deserialization, default fallback, and clearing. *(Delivered)*
- [x] T012 [GAP-003] Migrate `apps/web/src/features/appointments/hooks/useAppointmentFilters.ts` (or equivalent) to use `useUrlFilters` instead of local `useState`. *(Delivered — useAppointmentList.ts:32)*
- [x] T013 [P] [GAP-003] Migrate `apps/web/src/features/properties/hooks/usePropertyFilters.ts` (or equivalent) to use `useUrlFilters`. *(Delivered — usePropertyList.ts:25)*
- [x] T014 [P] [GAP-003] Migrate `apps/web/src/features/inspectors/hooks/useInspectorFilters.ts` (or equivalent) to use `useUrlFilters`. *(Delivered — useInspectorList.ts:24)*

**Checkpoint**: 3 key list pages persist filters in URL. Pattern is reusable for other pages.

---

## Phase 4: GAP-006 — All 5 Mandatory Screen States (Priority: MEDIUM)

**Goal**: Every data screen implements loading, error, empty, no-permission, and filter-required states.

**Independent Test**: Simulate each state on the appointments list page — verify correct component renders for each.

### Implementation

- [x] T015 [GAP-006] Create `NoPermissionState` component in `apps/web/src/components/feedback/NoPermissionState.tsx`. *(Delivered)*
- [x] T016 [P] [GAP-006] Create `FilterRequiredState` component in `apps/web/src/components/feedback/FilterRequiredState.tsx`. *(Delivered)*
- [x] T017 [P] [GAP-006] Write tests for `NoPermissionState` in `apps/web/src/components/feedback/__tests__/NoPermissionState.test.tsx`. *(Delivered)*
- [x] T018 [P] [GAP-006] Write tests for `FilterRequiredState` in `apps/web/src/components/feedback/__tests__/FilterRequiredState.test.tsx`. *(Delivered)*
- [ ] T019 [GAP-006] Add `NoPermissionState` to 3 key pages that can be role-restricted (audit logs for non-AM, financial for non-authorized CL_USER).
- [x] T020 [GAP-006] Add `FilterRequiredState` to pages requiring tenant context (financial entries for AM, reports for AM). *(Delivered — FinancialEntriesPage, InvoicesPage, PropertyListPage, PricingRuleListPage, TimeSlotConfigPage)*

**Checkpoint**: 5 mandatory states implemented as shared components. Key screens use all 5.

---

## Phase 5: GAP-005 + GAP-007 + GAP-008 — Low-Impact Polish (parallel)

**Goal**: Small UX improvements per dossier requirements.

### GAP-005: Filter Loading Indicator

- [x] T021 [P] [GAP-005] Add optional `loading?: boolean` prop to `FilterBar` in `apps/web/src/components/filters/FilterBar.tsx`. *(Delivered)*
- [ ] T022 [P] [GAP-005] Update `apps/web/src/components/filters/__tests__/FilterBar.test.tsx` — test spinner visibility when `loading` is true/false.

### GAP-007: Sidebar Map-Mode Background

- [x] T023 [P] [GAP-007] In `apps/web/src/components/shell/Sidebar.tsx`, detect if the current route is a map page (path contains `/map`). If so, apply `bg-[#F5F5F5]` instead of `bg-transparent` to the sidebar background on desktop. *(Delivered — Sidebar.tsx:92)*
- [x] T024 [P] [GAP-007] Update `apps/web/src/components/shell/__tests__/Sidebar.test.tsx` — test background class changes on map routes. *(Delivered)*

### GAP-008: FloatingTotalBar for Financial Pages

- [x] T025 [P] [GAP-008] Create `FloatingTotalBar` component in `apps/web/src/components/layout/FloatingTotalBar.tsx`. *(Delivered)*
- [x] T026 [P] [GAP-008] Write tests for `FloatingTotalBar` in `apps/web/src/components/layout/__tests__/FloatingTotalBar.test.tsx`. *(Delivered)*
- [ ] T027 [GAP-008] Integrate `FloatingTotalBar` into the financial entries page in `apps/web/src/features/financial/`.

**Checkpoint**: All 3 low-impact polish items complete.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T028 Run `pnpm --filter web test` to verify all tests pass including new ones.
- [ ] T029 Run `pnpm --filter web typecheck` to verify no type errors.
- [ ] T030 Visual audit: verify MapContainer renders tiles (requires `VITE_MAPBOX_TOKEN` in `.env.local`).
- [ ] T031 Verify URL filter persistence works end-to-end on 3 migrated pages.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Verification)**: No dependencies — start immediately
- **Phase 2 (GAP-001 Map)**: Depends on Phase 1 — serial, blocks 016-geospatial
- **Phase 3 (GAP-003 URL Filters)**: Depends on Phase 1 — can run in parallel with Phase 2
- **Phase 4 (GAP-006 States)**: Depends on Phase 1 — can run in parallel with Phases 2-3
- **Phase 5 (Polish)**: Depends on Phase 1 — can run in parallel with Phases 2-4
- **Phase 6 (Validation)**: Depends on all phases completing

### Parallel Opportunities

```
After Phase 1 (verification), these can all start in parallel:
  Phase 2: GAP-001 (Map)
  Phase 3: GAP-003 (URL Filters)
  Phase 4: GAP-006 (States)
  Phase 5: GAP-005 + GAP-007 + GAP-008 (Polish)
```

Within each phase, tasks marked `[P]` can run in parallel.

---

## Implementation Strategy

### MVP First (GAP-001 Only)

1. Complete Phase 1: Verification
2. Complete Phase 2: GAP-001 (Map integration)
3. **STOP and VALIDATE**: Map pages render real tiles. 016 is unblocked.

### Incremental Delivery

1. Phase 1 → Baseline verified
2. Phase 2 (GAP-001) → Maps work → Unblocks 016
3. Phase 3 (GAP-003) → URL filters persist → Better UX
4. Phase 4 (GAP-006) → All 5 states → Dossier compliance
5. Phase 5 (GAP-005/007/008) → Polish → Complete

---

## Notes

- This is a **frontend-only** spec. No backend changes.
- All tests run via `pnpm --filter web test`.
- MapContainer requires `VITE_MAPBOX_TOKEN` env — tests mock `mapboxgl.Map`.
- GAP-002 (Board/Kanban) is explicitly deferred per dossier.
- GAP-004 (TableSwitch) already works — no task needed.
- 31 total tasks across 6 phases.
