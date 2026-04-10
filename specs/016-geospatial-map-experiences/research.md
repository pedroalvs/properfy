# Research: Geospatial Map Experiences

**Feature**: 016-geospatial-map-experiences
**Date**: 2026-04-10

## Research Summary

Exploration of the current codebase revealed that several gaps listed in the spec are already closed. This research documents what exists vs. what actually needs to be done.

---

## R1: Current State of Map Components

**Finding**: `MapContainer.tsx` already uses real Mapbox GL (not a placeholder). It initializes `mapboxgl.Map`, loads the `streets-v12` style, handles token validation, and exposes `onMapReady` callback with the map instance.

**Evidence**: `apps/web/src/components/map/MapContainer.tsx` (143 lines) — `mapboxgl.Map` initialization at the top of the component, navigation controls added, click handlers wired.

**Implication**: GAP-001 in the spec is **already closed**. No Mapbox GL integration work needed on MapContainer itself. The remaining work is consuming the map instance from page code to add markers, popups, and fitBounds().

---

## R2: Current State of Map Routes

**Finding**: Routes `/appointments/map`, `/properties/map`, `/service-groups/map` are **enabled and active** in `router.tsx`. They are NOT disabled via redirects.

**Evidence**: `apps/web/src/app/router.tsx` — all 3 routes are defined with proper role guards and point to real page components.

**Implication**: GAP-002 is **already closed**. No router changes needed.

---

## R3: Appointment Coordinates in Backend Response

**Finding**: The appointment list endpoint (`GET /v1/appointments`) does NOT include `latitude`/`longitude` in the response schema, even though the Property entity has `lat`/`lng` columns.

**Evidence**:
- `PrismaAppointmentRepository.findAll()` does not select `property.lat` / `property.lng` (line ~168)
- `PrismaAppointmentRepository.findById()` DOES select them (line ~122) — asymmetric
- `appointmentResponseSchema` in `packages/shared/src/schemas/responses.ts` does not define `latitude`/`longitude`
- Frontend `useAppointmentMapData` expects these fields and silently receives `undefined`

**Decision**: Add `latitude` and `longitude` to:
1. `appointmentResponseSchema` (shared)
2. `PrismaAppointmentRepository.findAll()` select clause (include property coords)
3. `ListAppointmentsUseCase` output mapping (propagate coords)

**Rationale**: This is the smallest change that unblocks the appointment map. Matches the existing pattern in `findById()`.

**Alternatives considered**:
- Creating a new `/v1/appointments/map` endpoint — rejected as unnecessary; the existing list endpoint with `hasCoordinates=true` is sufficient
- Nesting `property` object with coords — rejected; flat `latitude`/`longitude` matches the frontend hook's expectation

---

## R4: Auto-Fit Bounds

**Finding**: Maps currently hardcode Sydney as default center (`[133.7751, -25.2744]`). No call to `map.fitBounds()` after data loads.

**Decision**: Add client-side bounds calculation and call `map.fitBounds()` via the `onMapReady` callback or a ref after data loads.

**Approach**:
1. Create a small utility `apps/web/src/lib/map-bounds.ts` with `computeBounds(points: Array<{latitude, longitude}>): LngLatBoundsLike | null`
2. In each map page, compute bounds from filtered data and call `map.fitBounds()` via a ref or effect
3. Handle edge cases: empty data (skip fitBounds), single point (use `flyTo` with fixed zoom)

**Rationale**: Client-side calculation is simple, correct, and doesn't require backend changes. The existing 200-item cap means bounds computation is cheap.

**Alternatives considered**:
- Server-side bounding-box endpoint — rejected as premature (GAP-006 is LOW priority)
- Mapbox's `bbox` query parameter on data fetch — requires backend work, out of scope

---

## R5: Pin Clustering

**Finding**: No clustering logic. Multiple pins at nearby coordinates stack visually.

**Decision**: Use Mapbox GL's native GeoJSON source clustering. Convert map data to a GeoJSON FeatureCollection and add it as a source with `cluster: true`.

**Approach**:
1. In each map page (or a shared helper), convert the visible items to GeoJSON features
2. Add the source to the map with `cluster: true`, `clusterMaxZoom: 14`, `clusterRadius: 50`
3. Add a `circle` layer for clusters with count labels
4. Add an `unclustered-point` layer for individual pins
5. Keep `MapMarker`/`MapPopup` for individual pins when zoomed in enough

**Rationale**: Mapbox GL clustering is built-in, performant, and doesn't require extra dependencies. It's the canonical solution and Mapbox's docs demonstrate it.

**Alternatives considered**:
- `supercluster` library (used by Mapbox internally) — rejected as adding a dependency when native clustering suffices
- Manual grid-based clustering — rejected as reinventing the wheel
- No clustering — rejected per spec FR-025

**Scope note**: The current implementation likely uses `MapMarker` components (DOM-based HTML markers). Switching to GeoJSON source + layers is a bigger refactor than just adding bounds fitting. For this pass, I'll consider whether to implement clustering at all, or defer it to a later iteration if the scope creeps.

---

## R6: Sidebar Background on Map Routes

**Finding**: `Sidebar.tsx` already detects map routes via `isMapRoute = pathname.includes('/map')` and applies `bg-[#F5F5F5]` accordingly.

**Evidence**: From 014 exploration — this was already closed as part of 014 Phase 2 gap closure.

**Implication**: FR-005 is **already satisfied**. No work needed.

---

## R7: Map Token Fallback

**Finding**: `MapContainer.tsx` already handles missing Mapbox token with a graceful error message.

**Implication**: GAP-007 is **already closed**.

---

## R8: Service Region Polygons

**Finding**: `RegionMap.tsx` uses Mapbox Draw and is production-ready. Polygon creation, editing, and display work correctly.

**Implication**: US4 and FR-014 through FR-018 are **already satisfied**. No work needed.

---

## R9: Service Group Map Two-Level Interaction

**Finding**: `ServiceGroupMapPage.tsx` already implements the group-first, appointments-second pattern with the instruction overlay when no group is selected.

**Implication**: US7 is mostly complete. The remaining gap is that nested appointments in service groups also need coordinates — this is covered by the same backend fix for R3 (the service group response includes nested appointments which inherit the same schema).

---

## Final Gap List (What Actually Needs Work)

| # | Gap | Priority | Scope |
|---|-----|----------|-------|
| 1 | Appointment coordinates in API response | CRITICAL | Backend + shared schema |
| 2 | Auto-fit bounds to visible pins | HIGH | Frontend utility + 3 pages |
| 3 | Pin clustering | MEDIUM | Frontend (evaluate scope before committing) |

**Out of scope for this pass** (LOW priority, non-blocking):
- Mobile popup as bottom sheet (GAP-005)
- Bounding-box server-side filtering (GAP-006)
- Marketplace privacy enforcement (US8 — separate privacy feature)
