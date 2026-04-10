# Feature Specification: Geospatial Map Experiences

**Feature Branch**: `016-geospatial-map-experiences`
**Created**: 2026-04-06
**Feature Status**: PARTIALLY IMPLEMENTED — layout components and page scaffolds exist; map rendering (Mapbox GL) is placeholder except for service region polygon editing which is production-ready; map routes are disabled via redirects
**Sources**:
- Code: `apps/web/src/components/map/`, `apps/web/src/features/*/pages/*MapPage.tsx`, `apps/web/src/features/service-regions/components/RegionMap.tsx`
- Approved rules: `projeto-consolidado/frontend-system-spec.md` (section 6.7), `projeto-consolidado/layout-behavior-rules.md` (section 10)
- Cross-feature: `013-service-regions` (polygons, coverage resolution), `003-properties` (coordinates), `006-appointments` (geographic distribution), `005-service-groups-marketplace` (marketplace offers), `014-frontend-app-shell-ux` (MapScreenLayout template)

> **Reading guide.** This spec defines the **canonical map interaction patterns** shared across all map-enabled surfaces in Properfy. Individual features (appointments, properties, service groups, marketplace, service regions) own their domain-specific data and business rules. This spec owns the shared map UX: layout, selection, synchronization, filtering, states, polygon editing, and pin behavior.
>
> `Status` values: `IMPLEMENTED` (present in code), `APPROVED` (binding rule from dossier), `DIVERGENCE` (code contradicts dossier), `GAP` (not yet implemented).

## User Scenarios & Testing

### User Story 1 — Operator views entity locations on a geographic map with side panel (Priority: P1)

- **Status**: PARTIALLY IMPLEMENTED (layout and page scaffolds exist; MapContainer is placeholder)
- **Source**: code + dossier

An operator (AM, OP, CL_ADMIN, CL_USER) opens a map view for appointments, properties, or service groups. The screen shows a fullscreen map on the right and a functional side panel on the left (400px default). The side panel contains filters and a scrollable list of entities. Each entity with valid coordinates appears as a pin on the map. The map is an operational tool — not decorative.

**Why this priority**: The map + side panel layout is the foundation for all map experiences. Without it, no map surface works.

**Independent Test**: Open the appointment map page. Verify the side panel shows a filter area and appointment list. Verify pins appear on the map for appointments with coordinates. Verify appointments without coordinates appear in the list but not on the map.

**Acceptance Scenarios**:

1. **Given** an operator on any map page, **When** the page loads, **Then** a side panel (400px) appears on the left with filters and entity list, and the map fills the remaining space.
2. **Given** entities with valid coordinates, **When** the map renders, **Then** each entity appears as a colored pin at its geographic location.
3. **Given** entities without coordinates (geocoding pending/failed), **When** the map renders, **Then** those entities appear in the side panel list but NOT as pins on the map.
4. **Given** a mobile viewport, **When** the map page renders, **Then** the layout stacks vertically (side panel above map).
5. **Given** the map has loaded with pins, **When** the operator views the map, **Then** the map auto-fits bounds to show all visible pins with appropriate padding. (`GAP` — not yet implemented; maps currently show fixed default center.)
6. **Given** the sidebar of the app shell on a map page, **When** displayed, **Then** its background matches the operational canvas gray (#F5F5F5). (`APPROVED RULE` — per dossier section 4.1.)

---

### User Story 2 — Operator clicks a pin or list item and sees synchronized selection (Priority: P1)

- **Status**: PARTIALLY IMPLEMENTED (selection state exists in page code; popup component exists)
- **Source**: code

When the operator clicks a map pin, the corresponding item in the side panel list is highlighted and scrolled into view. Conversely, clicking a list item highlights the corresponding pin on the map. A popup card appears near the selected pin showing key details and action buttons (e.g., "View Details" which opens a drawer or navigates to the detail page).

**Why this priority**: Pin-list synchronization is the core interaction that makes maps useful as operational tools rather than passive visualizations.

**Independent Test**: Click a pin on the appointment map — verify the side panel list scrolls to and highlights the corresponding appointment. Click an appointment in the list — verify the corresponding pin is highlighted on the map. Verify the popup shows appointment status, address, and date.

**Acceptance Scenarios**:

1. **Given** a pin on the map, **When** the operator clicks it, **Then** the pin enters an "active" state (ring highlight), a popup card appears near the pin with entity summary, and the corresponding list item is highlighted and scrolled into view.
2. **Given** an item in the side panel list, **When** the operator clicks it, **Then** the corresponding pin is highlighted on the map and the map pans/zooms to center on it. A popup appears.
3. **Given** an active popup, **When** the operator clicks the "View Details" action, **Then** a drawer slides in from the right with full entity details (per 014#US3 drawer pattern), or the operator navigates to the detail page for complex flows.
4. **Given** an active popup, **When** the operator clicks the close button or clicks elsewhere on the map, **Then** the popup closes and the pin/list selection is cleared.

---

### User Story 3 — Operator filters map data via the side panel filter bar (Priority: P1)

- **Status**: IMPLEMENTED (filter state and hooks exist in all 3 map pages)
- **Source**: code

The side panel contains a collapsible filter section above the entity list. Filters vary by map surface (status + date for appointments, type + search for properties, status + search for service groups). When filters change, both the map pins and the side panel list update to show only matching entities. The filter panel collapses/expands with a smooth animation.

**Why this priority**: Filtering is essential for making maps operationally useful with large datasets.

**Independent Test**: On the appointment map, filter by status "SCHEDULED". Verify only scheduled appointment pins remain on the map and only scheduled appointments appear in the list. Collapse the filter panel — verify it slides up smoothly. Expand again — filters are preserved.

**Acceptance Scenarios**:

1. **Given** a map with filters, **When** the operator changes a filter value, **Then** both the map pins and side panel list update to show only matching entities.
2. **Given** the filter panel, **When** the operator clicks the panel header, **Then** it collapses/expands with a smooth height animation.
3. **Given** all filters cleared, **When** no entities have coordinates, **Then** the map shows an empty state with an instructional message (per dossier rule: "empty map state must instruct the operator").
4. **Given** filters that produce results, **When** the map updates, **Then** the map auto-fits bounds to the filtered result set.

---

### User Story 4 — Operator draws and edits service region polygons on the map (Priority: P1)

- **Status**: IMPLEMENTED (RegionMap component with Mapbox Draw is production-ready)
- **Source**: code

When creating or editing a service region, the operator uses a polygon drawing tool on a satellite map. Existing regions are shown as semi-transparent colored overlays with labels. The operator draws a new polygon by clicking vertices, and the system captures the GeoJSON. In edit mode, the existing polygon is loaded and the operator can modify vertices.

**Why this priority**: Region polygon editing is the only map surface that writes data (not just reads). It is already implemented and production-ready.

**Independent Test**: Open the service region create form. Verify the drawing tool allows clicking vertices to form a polygon. Complete the polygon — verify GeoJSON is captured. Open an existing region for editing — verify the polygon loads and vertices are movable.

**Acceptance Scenarios**:

1. **Given** the region creation flow, **When** the map loads in editable mode, **Then** a polygon drawing tool is active. The operator clicks to place vertices and the polygon auto-closes when they complete the shape.
2. **Given** existing regions for the tenant, **When** the map renders, **Then** each existing region appears as a semi-transparent colored fill with a labeled outline.
3. **Given** the region edit flow, **When** the map loads, **Then** the existing polygon is loaded with movable vertices. The operator can drag vertices to reshape.
4. **Given** a completed polygon, **When** the operator finishes drawing, **Then** the GeoJSON representation is captured and passed to the form for submission.
5. **Given** the drawing tool, **When** the operator clicks the trash icon, **Then** the drawn polygon is deleted so they can start over.
6. **Given** the map in read-only mode (e.g., region list page), **When** displayed, **Then** no drawing tools appear. The map shows regions as colored overlays only.

---

### User Story 5 — Operator views appointment geographic distribution by status (Priority: P2)

- **Status**: PARTIALLY IMPLEMENTED (page scaffold and data hook exist; map rendering is placeholder)
- **Source**: code

The appointment map shows each appointment as a color-coded pin based on its status (DRAFT = purple, AWAITING_INSPECTOR = orange, SCHEDULED = light blue, DONE = green, CANCELLED = red, REJECTED = coral). The operator uses this view to understand geographic distribution of work, identify areas with many pending appointments, and spot coverage gaps.

**Why this priority**: The appointment map is the highest-value operational map — it directly supports daily scheduling and logistics decisions.

**Independent Test**: Seed appointments in multiple statuses across different locations. Open the appointment map. Verify pins are colored by status. Filter by "SCHEDULED" — verify only blue pins remain. Click a pin — verify popup shows appointment code, status, address, date, inspector name, and a "View Details" action.

**Acceptance Scenarios**:

1. **Given** appointments with coordinates, **When** displayed on the map, **Then** each pin is colored according to its appointment status using the centralized status color palette.
2. **Given** the appointment map side panel, **When** displayed, **Then** filters include: status (multi-select), date range (from/to), and branch (if applicable).
3. **Given** a selected appointment pin, **When** the popup appears, **Then** it shows: appointment code, status chip, address, scheduled date/time, inspector name (if assigned), and a "View Details" action button.
4. **Given** the "View Details" action in the popup, **When** clicked, **Then** the appointment detail drawer opens (per 014#US3 pattern).

---

### User Story 6 — Operator views property locations by type (Priority: P2)

- **Status**: PARTIALLY IMPLEMENTED (page scaffold and data hook exist)
- **Source**: code

The property map shows each property as a color-coded pin based on its type (Residential = blue, Commercial = orange, Industrial = brown, Rural = green). The operator uses this view to understand geographic coverage of the property portfolio and identify clusters.

**Why this priority**: The property map supports portfolio visibility and helps operators assess geographic density.

**Independent Test**: Seed properties of different types with coordinates. Open the property map. Verify pins are colored by type. Filter by "Commercial" — verify only orange pins remain.

**Acceptance Scenarios**:

1. **Given** properties with coordinates, **When** displayed, **Then** each pin is colored by property type.
2. **Given** the property map side panel, **When** displayed, **Then** filters include: search (address), property type.
3. **Given** a selected property pin, **When** the popup appears, **Then** it shows: address, property type, branch name, and a "View Details" action.

---

### User Story 7 — Operator views service group appointments on the map (Priority: P2)

- **Status**: PARTIALLY IMPLEMENTED (page scaffold exists with group selection pattern)
- **Source**: code

The service group map has a unique two-level interaction: the side panel first shows a list of service groups. When the operator selects a group, the map displays the appointments belonging to that group. This helps the operator understand the geographic spread of a group's appointments before publishing to the marketplace.

**Why this priority**: Geographic visualization of service groups directly supports the marketplace publish decision.

**Independent Test**: Open the service group map. Verify the side panel lists service groups. Select a group — verify its appointments appear as pins on the map. Select a different group — verify pins update.

**Acceptance Scenarios**:

1. **Given** the service group map, **When** it loads, **Then** the side panel shows a list of service groups with their status, region name, and appointment count. No pins are shown on the map until a group is selected.
2. **Given** no group selected, **When** the map area is viewed, **Then** an empty state overlay instructs the operator: "Select a service group to view its appointments on the map."
3. **Given** a selected service group, **When** its appointments load, **Then** appointment pins appear on the map colored by appointment status.
4. **Given** the selected group's region, **When** displayed, **Then** the region polygon is shown as a semi-transparent overlay on the map behind the appointment pins.

---

### User Story 8 — Inspector views marketplace offers on a map (Priority: P3)

- **Status**: PARTIALLY IMPLEMENTED (MarketplacePage layout exists; map intentionally shows placeholder)
- **Source**: code + dossier

An inspector views available marketplace offers on a map. For privacy and security, **property locations are not shown until the inspector accepts an offer**. Before acceptance, the map shows approximate region coverage only. After acceptance, exact appointment locations are revealed.

**Why this priority**: Lower priority because the marketplace is inspector-facing (smaller user base) and the privacy constraint limits map utility before acceptance.

**Independent Test**: As INSP, open the marketplace. Verify the map area shows the privacy message before acceptance. Accept an offer — verify appointment locations are then revealed on the map.

**Acceptance Scenarios**:

1. **Given** an INSP actor on the marketplace page, **When** viewing unaccepted offers, **Then** the map area displays a message: "Exact coordinates are only revealed after offer acceptance." No property pins are shown.
2. **Given** the marketplace side panel, **When** displayed, **Then** it shows a card list of available offers with group name, region, appointment count, and priority mode.
3. **Given** an accepted offer, **When** the inspector views the group's appointments, **Then** exact appointment locations appear as pins on the map.

---

### Edge Cases

- **No coordinates on any entity**: If all entities in a filtered view lack coordinates, the map shows an empty state with an instructional message. The side panel list still shows all entities.
- **Mixed coordinates**: Some entities have coordinates, some do not. Only those with coordinates appear as pins. The list shows all entities with a visual indicator for missing coordinates.
- **Overlapping pins**: Multiple entities at the same (or very close) coordinates should be handled by clustering. When zoomed in enough that pins no longer overlap, individual pins appear. (`GAP` — clustering logic not yet implemented.)
- **Region overlap on region map**: Multiple regions may overlap geographically. Each is rendered as a separate semi-transparent layer. The operator can visually distinguish overlapping areas by the blended colors.
- **Large datasets**: Map data hooks cap results at 100-200 items per request. For tenants with more entities, pagination or server-side bounding-box filtering may be needed in the future.
- **Map token missing**: If the Mapbox token is not configured, the map area should show a graceful fallback message instead of a broken/empty canvas.
- **Mobile map interaction**: On mobile, the side panel collapses to a minimal view. Touch gestures (pinch-zoom, pan) work on the map area. The popup appears as a bottom sheet rather than a floating card.
- **Sidebar background on map pages**: Per dossier rule, the app sidebar background should change to match the operational canvas gray (#F5F5F5) on map pages. This is an approved rule that needs verification.

## Requirements

### Functional Requirements

All FRs below are `Status: IMPLEMENTED, Source: code` unless otherwise noted.

#### Shared Map Layout

- **FR-001**: Map pages MUST use the MapScreenLayout template: a scrollable side panel (400px default width) on the left and the map filling remaining space.
- **FR-002**: On mobile viewports, the layout MUST stack vertically (side panel above map).
- **FR-003**: The side panel MUST contain a collapsible filter section (MapFiltersPanel) with smooth height animation, followed by a scrollable entity list.
- **FR-004** (`APPROVED, GAP`): The map MUST auto-fit bounds to show all visible pins with appropriate padding when data loads or filters change. Currently not implemented — maps show a fixed default center.
- **FR-005** (`APPROVED, Source: dossier`): The app sidebar background MUST change to operational canvas gray (#F5F5F5) on map pages.

#### Pin and Selection Behavior

- **FR-006**: Each entity with valid coordinates MUST appear as a colored pin at its geographic location. Pin color MUST follow domain rules (status color for appointments, type color for properties).
- **FR-007**: Clicking a map pin MUST: (a) highlight the pin with an active ring, (b) show a popup card with entity summary and actions, (c) highlight and scroll to the corresponding side panel list item.
- **FR-008**: Clicking a side panel list item MUST: (a) highlight the corresponding pin, (b) pan/zoom the map to center on the pin, (c) show the popup.
- **FR-009**: Clicking the popup close button, another pin, or an empty map area MUST clear the selection and close the popup.
- **FR-010**: Popup "View Details" action MUST open a drawer (per 014#US3) or navigate to the detail page for complex flows.

#### Filtering

- **FR-011**: Filter changes MUST update both the map pins and the side panel list simultaneously.
- **FR-012**: Filters MUST be domain-specific: status + date range for appointments, type + search for properties, status + search for service groups.
- **FR-013**: The filter panel MUST be collapsible with smooth animation and MUST preserve filter state when collapsed/expanded.

#### Polygon Editing (Service Regions)

- **FR-014**: The region map MUST support polygon drawing with a click-to-place-vertices tool.
- **FR-015**: In edit mode, the existing polygon MUST be loaded with movable vertices.
- **FR-016**: Existing tenant regions MUST be displayed as semi-transparent colored overlays with name labels behind the active drawing area.
- **FR-017**: The drawing tool MUST include a trash (delete) function to clear the drawn polygon and start over.
- **FR-018**: In read-only mode, no drawing tools MUST appear. Regions are displayed as colored overlays only.

#### Map States

- **FR-019** (`APPROVED, Source: dossier`): Empty map state MUST instruct the operator (e.g., "No appointments with coordinates in the current filter. Try adjusting filters or check geocoding status.").
- **FR-020**: Loading state MUST show a visual indicator while map data is being fetched.
- **FR-021**: Error state MUST show an error message with a retry action if the map data request fails.
- **FR-022**: For the service group map, the map MUST show an instruction overlay when no group is selected ("Select a service group to view its appointments on the map.").

#### Privacy and Role Awareness

- **FR-023**: On the marketplace map (INSP role), property coordinates MUST NOT be revealed before offer acceptance. A privacy message MUST be shown instead.
- **FR-024**: Map access MUST follow the RBAC matrix (015#role-matrix): AM and OP see all map data within scope; CL_ADMIN and CL_USER see own-tenant data; INSP sees assigned data only.

#### Clustering

- **FR-025** (`GAP`): When multiple entities share the same or nearby coordinates, the map MUST group them into a cluster marker showing the count. Zooming in MUST expand clusters into individual pins.

### Key Entities

- **MapPin** — A geographic marker representing an entity (appointment, property) at a specific latitude/longitude. Carries a color (domain-determined), label (entity code/name), and active state (ring highlight on selection).
- **MapPopup** — A floating card near a selected pin showing entity summary (title, status, address, key details) and action buttons (View Details, etc.).
- **MapScreenLayout** — The canonical two-column layout for map pages: side panel (filters + list) on left, map on right.
- **RegionOverlay** — A semi-transparent polygon fill on the map representing a service region, with color from the region entity and a name label.
- **MapFilterState** — The set of active filter values for a map surface, driving both pin visibility and list content.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All 5 map-enabled pages (appointments, properties, service groups, regions, marketplace) render correctly with the shared MapScreenLayout — verified by E2E tests.
- **SC-002**: Pin-list selection synchronization works bidirectionally (pin click highlights list item, list click highlights pin) — verified by Playwright interaction test.
- **SC-003**: Filters update both map pins and list simultaneously — verified by filter change test asserting pin count matches list count.
- **SC-004**: Service region polygon drawing captures valid GeoJSON on creation and preserves editable vertices on edit — verified by E2E test submitting a drawn polygon.
- **SC-005**: Map auto-fits bounds to show all visible pins within 500ms of data load — verified by Playwright timing assertion.
- **SC-006**: Empty, loading, and error states are displayed correctly on every map page — verified by E2E tests simulating each state.
- **SC-007**: Marketplace map does NOT reveal property coordinates before offer acceptance — verified by security-focused E2E test as INSP role.
- **SC-008**: Map pages render within 3 seconds on standard broadband connection with up to 200 pins — verified by Lighthouse performance audit.

## Assumptions

- Mapbox GL is the map rendering library. The MapContainer component is currently a placeholder but is structurally ready for Mapbox integration. A valid Mapbox token is required for production rendering.
- Property coordinates (lat/lng) are the canonical point geometry. This feature does not own geocoding — it consumes coordinates as-is from the properties API (feature 003).
- Service region polygons are stored as GeoJSON (feature 013). This feature consumes and displays them; creation/editing is done via the RegionMap component which uses Mapbox Draw.
- Map data is fetched via existing API endpoints with filter parameters. No new backend endpoints are needed — the map hooks call the same list APIs with a `hasCoordinates: true` filter.
- Map routes (`/appointments/map`, `/properties/map`, `/service-groups/map`) exist in the router but are currently disabled via redirects. Enabling them is a router configuration change, not new feature work.
- The satellite-streets map style is used for region editing (production). Standard streets style is used for point-based maps (appointments, properties).
- Clustering is a future enhancement (GAP). The current cap of 100-200 items per map request means cluster UX is not blocking, but will be needed at scale.
- The dossier specifies map filter panels should support 480px width with translateX animation. The current implementation uses a collapsible height animation within the side panel instead. This is a minor divergence — the functional intent (show/hide filters without losing map context) is met.

## Known Gaps

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | MapContainer is placeholder | **CRITICAL** | Map rendering uses placeholder divs. Full Mapbox GL integration needed for pins, popups, and interactions to work in the browser. RegionMap works because it has its own Mapbox GL instance. |
| GAP-002 | Map routes disabled via redirects | H | `/appointments/map`, `/properties/map`, `/service-groups/map` all redirect to their list page equivalents. Enabling these routes is the final step after MapContainer integration. |
| GAP-003 | Auto-fit bounds | H | Maps do not auto-zoom to fit all visible pins. Default center is hardcoded (Sydney). Must calculate bounding box from visible entities and call `map.fitBounds()`. |
| GAP-004 | Pin clustering | M | No clustering logic. Multiple entities at nearby coordinates will overlap. Mapbox GL's `supercluster` library or built-in clustering should be integrated. |
| GAP-005 | Mobile popup as bottom sheet | L | Popups render as floating cards on all viewports. On mobile, a bottom sheet pattern may be more ergonomic. |
| GAP-006 | Bounding-box server-side filtering | L | Map data hooks fetch up to 200 items. For tenants with thousands of entities, the API should support bounding-box filtering (`minLat`, `maxLat`, `minLng`, `maxLng`) to load only visible entities. |
| GAP-007 | Map token fallback | L | If Mapbox token is missing, the map area should show a graceful message. Current behavior undefined. |
