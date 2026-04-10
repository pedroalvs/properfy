# Tasks: Geospatial Map Experiences

**Input**: Design documents from `/specs/016-geospatial-map-experiences/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: TDD is mandatory per constitution. Unit tests included for new utilities; existing integration test coverage protects backend changes.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US5, US6, US7)
- Include exact file paths in descriptions

## Path Conventions

- **Shared**: `packages/shared/src/`
- **Backend**: `apps/backend/src/`
- **Backend tests**: `apps/backend/tests/`
- **Frontend**: `apps/web/src/`

---

## Phase 1: Setup

**Purpose**: No project initialization needed. All stack exists. This feature only modifies existing files and adds one small utility.

- [X] T001 Verify prerequisite state: confirm MapContainer uses real Mapbox GL (`apps/web/src/components/map/MapContainer.tsx`), map routes enabled (`apps/web/src/app/router.tsx`), sidebar map-mode background works (`apps/web/src/components/shell/Sidebar.tsx`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend coordinate exposure — unblocks all appointment-related map stories (US5, US7).

**CRITICAL**: No map user story work can begin until this phase is complete.

- [X] T002 Add `latitude` and `longitude` fields to `appointmentResponseSchema` in `packages/shared/src/schemas/responses.ts` as `z.number().nullable().optional()`
- [X] T003 Rebuild shared package: `pnpm --filter @properfy/shared build`
- [X] T004 Update `PrismaAppointmentRepository.findAll()` in `apps/backend/src/modules/appointment/infrastructure/prisma-appointment.repository.ts` to include `property: { select: { lat: true, lng: true, ...existing } }` in the select clause (mirror what `findById()` already does)
- [X] T005 Update `ListAppointmentsUseCase` in `apps/backend/src/modules/appointment/application/use-cases/list-appointments.use-case.ts` to map `appointment.property?.lat`/`lng` from Decimal to number in each output item as `latitude`/`longitude`
- [X] T006 Run backend tests to verify no regressions: `pnpm --filter backend test`

**Checkpoint**: Appointment list endpoint now returns coordinates. Frontend `useAppointmentMapData` hook will start receiving valid `latitude`/`longitude` fields.

---

## Phase 3: User Story 1 — Operator views entity locations on map with side panel (Priority: P1) MVP

**Goal**: Maps auto-fit bounds to show all visible pins instead of hardcoded Sydney center.

**Independent Test**: Open any map page with data. Verify the map auto-zooms to show all pins within view with appropriate padding. Change filters to reduce pin count — verify map re-fits.

### Tests for User Story 1

- [X] T007 [P] [US1] Write unit tests for `computeBounds()` utility in `apps/web/src/lib/__tests__/map-bounds.test.ts` — test cases: empty array returns null, single point returns degenerate bounds, multiple points return correct sw/ne tuple, null coordinates are skipped, invalid coordinates (out of range) are skipped

### Implementation for User Story 1

- [X] T008 [US1] Create `computeBounds(points)` utility in `apps/web/src/lib/map-bounds.ts` — accepts `Array<{ latitude: number | null; longitude: number | null }>`, returns `LngLatBoundsLike | null`. Skip null/invalid coords; handle single-point edge case by returning a degenerate bounds (sw === ne)
- [X] T009 [US1] Use the existing `onMapReady(map)` callback in `apps/web/src/components/map/MapContainer.tsx` (confirmed present per research R1). In each map page, capture the `mapboxgl.Map` instance in a ref when `onMapReady` fires, then call `map.fitBounds(bounds, { padding: 50, maxZoom: 15 })` after data loads. Do NOT add a new prop; reuse the existing callback.
- [X] T010 [US1] Run unit tests: `pnpm --filter web test map-bounds`

**Checkpoint**: `computeBounds()` utility is tested and ready. MapContainer can accept or expose bounds.

---

## Phase 4: User Story 5 — Operator views appointment geographic distribution by status (Priority: P2)

**Goal**: Appointment map renders pins for each appointment with coordinates and auto-fits bounds.

**Independent Test**: Open `/appointments/map`. Verify pins appear at correct locations colored by status. Verify map auto-fits to show all pins. Filter by status — verify map re-fits to filtered set.

### Implementation for User Story 5

- [X] T011 [US5] Update `AppointmentMapPage.tsx` at `apps/web/src/features/appointments/pages/AppointmentMapPage.tsx` to compute bounds from `useAppointmentMapData()` results using `computeBounds()`, and pass to MapContainer via `fitBoundsTo` prop (or via the map ref in `onMapReady`)
- [X] T012 [US5] Handle edge cases in AppointmentMapPage: empty filtered data (skip fitBounds, keep current view); single point (call `map.flyTo` with a reasonable zoom like 14)
- [ ] T013 [US5] Manual verification: open `/appointments/map` in dev server, verify pins render and map auto-fits

**Checkpoint**: Appointment map is fully functional with auto-fit bounds.

---

## Phase 5: User Story 6 — Operator views property locations by type (Priority: P2)

**Goal**: Property map auto-fits bounds to visible property pins.

**Independent Test**: Open `/properties/map`. Verify pins appear colored by property type. Verify map auto-fits to show all pins.

### Implementation for User Story 6

- [X] T014 [US6] Update `PropertyMapPage.tsx` at `apps/web/src/features/properties/pages/PropertyMapPage.tsx` to compute bounds from `usePropertyMapData()` results and fit the map accordingly
- [X] T015 [US6] Handle edge cases: empty data and single point (same pattern as T012)
- [ ] T016 [US6] Manual verification: open `/properties/map` and verify auto-fit works

**Checkpoint**: Property map is fully functional with auto-fit bounds.

---

## Phase 6: User Story 7 — Operator views service group appointments on map (Priority: P2)

**Goal**: Service group map auto-fits bounds to appointments of the selected group.

**Independent Test**: Open `/service-groups/map`, select a group. Verify appointments appear as pins and map fits to show them. Select a different group — verify map re-fits.

### Implementation for User Story 7

- [X] T017 [US7] Update `ServiceGroupMapPage.tsx` at `apps/web/src/features/service-groups/pages/ServiceGroupMapPage.tsx` to compute bounds from the selected group's appointments and fit the map when a group is selected
- [X] T018 [US7] Handle edge cases: no group selected (skip fit, show instruction overlay per existing behavior); selected group with no appointments (empty bounds)
- [ ] T019 [US7] Manual verification: open `/service-groups/map`, select groups with appointments, verify auto-fit

**Checkpoint**: Service group map is fully functional with auto-fit bounds.

---

## Phase 7: Pin Clustering (Priority: P2, Scope Gate)

**Goal**: When multiple pins overlap at nearby coordinates, show a cluster marker with count. Zoom expands into individual pins.

**⚠️ SCOPE GATE**: Before starting this phase, verify current marker rendering approach (DOM-based `MapMarker` vs. GeoJSON source/layer). If the refactor to GeoJSON source + layer-based clustering is small, proceed. If it requires rewriting marker/popup handling, DEFER to a later iteration and document as residual.

### Implementation (conditional)

- [ ] T020 [US1] Read current `MapContainer` and map page marker rendering to decide scope. Report to user before proceeding if the refactor is more than ~200 lines of changes.
- [ ] T021 [US1] (If scope allows) Implement Mapbox GL native clustering: convert map data to GeoJSON FeatureCollection, add as source with `cluster: true, clusterMaxZoom: 14, clusterRadius: 50`. Add cluster and unclustered-point layers with `paint` configuration for colors and counts.
- [ ] T022 [US1] (If scope allows) Wire cluster click to zoom into the cluster (call `map.easeTo` with the cluster's expansion zoom)
- [ ] T023 [US1] (If scope allows) Unit test cluster utility if extracted

**Checkpoint**: If clustering implemented, dense areas show count badges. If deferred, document in residual findings.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Ensure everything works together and is verified.

- [X] T024 Run full frontend test suite: `pnpm --filter web test`
- [X] T025 [P] Run full backend test suite: `pnpm --filter backend test`
- [X] T026 [P] Run typecheck on all workspaces: `pnpm typecheck`
- [ ] T027 Manual smoke test: open each map page (`/appointments/map`, `/properties/map`, `/service-groups/map`) in dev, verify pins render and auto-fit bounds behaves correctly
- [ ] T028 End-to-end verification of selection sync and map states on all 3 map pages (`/appointments/map`, `/properties/map`, `/service-groups/map`) covering spec FR-007, FR-008, FR-009, FR-019, FR-020, FR-021, FR-022:
  - **Selection sync**:
    - click a pin → popup appears + corresponding list item highlighted and scrolled into view
    - click a list item → pin highlighted on map, map pans/zooms to center, popup appears
    - click popup close button (or empty map area) → popup closes and pin/list selection cleared
  - **Map states**:
    - empty (no data / filter excludes all) → instruction message shown
    - loading (data fetching) → visual indicator shown
    - error (API failure) → error message with retry
    - service-group instruction overlay → "Select a service group to view its appointments on the map." when no group selected
  - Report any behavior that does not match the spec as a residual finding; do NOT fix silently

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — verification only
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS US5 and US7 (appointment-related maps)
- **US1 (Phase 3)**: Independent — creates shared bounds utility
- **US5 (Phase 4)**: Depends on Phase 2 (backend coords) + Phase 3 (bounds utility)
- **US6 (Phase 5)**: Depends on Phase 3 only (properties already have coords)
- **US7 (Phase 6)**: Depends on Phase 2 + Phase 3
- **Clustering (Phase 7)**: Depends on Phase 3; scope-gated
- **Polish (Phase 8)**: Depends on all previous phases

### User Story Dependencies

- **US1 (bounds utility)**: No dependencies — foundational for all maps
- **US5 (appointment map)**: Phase 2 + US1
- **US6 (property map)**: US1 only (properties already expose coords)
- **US7 (service group map)**: Phase 2 + US1

### Parallel Opportunities

- Phase 2: T002-T005 are mostly sequential (schema → build → repo → use case), but T004 and T005 can be done in one pass since they're in the same module
- Phase 4-6 (US5, US6, US7): Can run in parallel after Phase 3 completes — each touches a different map page
- Phase 8: T024-T026 can run in parallel

---

## Implementation Strategy

### MVP First (Foundation + US1 + US5 + US6)

1. Phase 1 — verify prerequisites
2. Phase 2 — unblock appointment coordinates
3. Phase 3 — bounds utility
4. Phase 4 — appointment map
5. Phase 5 — property map
6. **STOP and VALIDATE**: 2 main maps fully functional

### Incremental Delivery

1. Setup + Foundational → backend coords exposed
2. US1 → bounds utility ready
3. US5 → appointment map fully functional
4. US6 → property map fully functional
5. US7 → service group map fully functional
6. Clustering (if scope allows) → dense areas handled
7. Polish → full verification

---

## Notes

- This is a **surgical enhancement** — no new components, no new API endpoints, no new dependencies
- RegionMap (US4) is already production-ready — **not touched**
- US8 (marketplace privacy) is **out of scope** for this pass — separate privacy feature
- GAP-005 (mobile popup bottom sheet) and GAP-006 (bbox server filtering) are **out of scope** (LOW priority, non-blocking)
- The 013 (service regions), 014 (app shell/UX), and 015 (permissions) foundations are reused — no changes needed in those layers
