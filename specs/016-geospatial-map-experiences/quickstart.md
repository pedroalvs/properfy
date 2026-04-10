# Quickstart: Geospatial Map Experiences

**Feature**: 016-geospatial-map-experiences
**Branch**: work on 015 branch (continuation)

## What this feature does

Closes the 3 remaining gaps in the shared map foundation so the appointment, property, and service group map pages are fully functional. Most of the map infrastructure already exists (MapContainer with real Mapbox GL, map pages, route enablement, RegionMap with polygon editing). This pass focuses on:

1. Exposing property coordinates on the appointment list API response
2. Auto-fitting the map to show all visible pins
3. (If scope allows) Pin clustering for dense areas

## Key files to understand first

### Backend
- `apps/backend/src/modules/appointment/infrastructure/prisma-appointment.repository.ts` — `findAll()` method, around line 168
- `apps/backend/src/modules/appointment/application/use-cases/list-appointments.use-case.ts` — output mapping
- `packages/shared/src/schemas/responses.ts` — `appointmentResponseSchema`

### Frontend
- `apps/web/src/components/map/MapContainer.tsx` — already Mapbox GL; exposes `onMapReady(map)` callback
- `apps/web/src/features/appointments/pages/AppointmentMapPage.tsx`
- `apps/web/src/features/properties/pages/PropertyMapPage.tsx`
- `apps/web/src/features/service-groups/pages/ServiceGroupMapPage.tsx`
- `apps/web/src/features/appointments/hooks/useAppointmentMapData.ts`

## Implementation order

### Phase 1: Backend coordinate exposure (CRITICAL — unblocks appointment map)

1. Update `packages/shared/src/schemas/responses.ts` — add `latitude` and `longitude` to `appointmentResponseSchema` as `z.number().nullable().optional()`
2. Update `PrismaAppointmentRepository.findAll()` — include property `lat`/`lng` in select clause (mirror what `findById()` does)
3. Update `ListAppointmentsUseCase` output mapping to propagate coordinates
4. Run backend tests — verify no regressions

### Phase 2: Auto-fit bounds (HIGH)

5. Create `apps/web/src/lib/map-bounds.ts` with `computeBounds(points)` utility + unit tests
6. Update `MapContainer.tsx` to accept optional `fitBoundsTo` prop OR expose the map instance via `onMapReady` for the page to call `fitBounds` directly (check current API)
7. Update each of the 3 map pages to compute bounds from visible data and call `map.fitBounds()` after data loads
8. Handle edge cases: empty data (skip), single point (use `flyTo` with fixed zoom)

### Phase 3: Pin clustering (MEDIUM — evaluate first)

9. **Spike first**: Read current marker rendering approach in the pages. If using React-based `MapMarker` components on top of the map, switching to GeoJSON source + layer-based clustering is a larger refactor.
10. Decision gate: if the refactor is small, implement native Mapbox clustering. Otherwise, defer to a later iteration and report as residual.

### Phase 4: Verification

11. Run full frontend test suite
12. Run backend test suite
13. Run typecheck on all workspaces
14. Manual smoke test: open each map page in dev and verify pins render at correct locations with auto-fit behavior

## Running locally

```bash
# Install deps
pnpm install

# Start backend
pnpm --filter backend dev

# Start web frontend
pnpm --filter web dev

# Run backend tests
pnpm --filter backend test

# Run frontend tests
pnpm --filter web test

# Typecheck everything
pnpm typecheck
```

## Key design decisions

- **No new API endpoints** — extend the existing `GET /v1/appointments` response
- **No schema migrations** — all required columns already exist
- **No new components** — reuse MapContainer, MapMarker, MapPopup
- **Client-side bounds calculation** — simple, correct, no backend round trip
- **Clustering is evaluated, not assumed** — scope gate before committing
- **Backward compatible** — new response fields are optional/nullable
