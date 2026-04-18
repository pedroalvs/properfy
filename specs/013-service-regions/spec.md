# Feature Specification: Service Regions

**Feature Branch**: `013-service-regions`
**Created**: 2026-04-06
**Feature Status**: IMPLEMENTED — Phase 1 shipped; `CORRECTION-004` (ServiceRegion per-tenant) is **resolved in code**. Verified 2026-04-13: `ServiceRegion.tenant_id` is a non-nullable `String` column with FK to `Tenant`; the domain entity declares `readonly tenantId: string`; every repository method (`findById`, `findByName`, `count`, `findAll`, `resolveRegionsForAppointments`, `findContainingPoint`) takes a `tenantId` parameter. Closing commits: `017a883` (2026-04-07, service-catalog wave 1–4, CORRECTION-004 batch) and `1f59837` (2026-04-08, deactivation guard for published groups). The User Story blocks below still carry legacy `DIVERGENCE` labels from the original extraction pass — these are kept for historical context but the code-level divergence has been closed. Editorial reconciliation 2026-04-13. See `specs/GAPS.md` for the gap status table.
**Sources**:
- Code: `apps/backend/src/modules/service-region/`, `apps/backend/prisma/schema.prisma` (`ServiceRegion`, `InspectorRegion`, `RegionStatus`), `packages/shared/src/schemas/service-region.ts`
- Approved rules: `.specify/memory/constitution.md` (II. Multi-Tenant Safety), `.specify/memory/correction-service-region-scope.md`
- Cross-feature: `004-service-catalog` (prior owner), `005-service-groups-marketplace`, `008-inspectors-execution`, `003-properties`

> **Reading guide.** Every user story declares `Priority`, `Status`, and `Source`.
> `Status` values: `IMPLEMENTED` (reality on the active branch), `APPROVED` (binding rule, implementation may be partial or absent), `DIVERGENCE` (code contradicts an approved rule), `GAP` (not yet approved, candidate for a future phase).
> `Source` values: `code` (verified against source files), `dossier` (from constitution / `projeto-consolidado/` / approved decision), `inferred` (derived from surrounding context; must be upgraded during review).

> **Extraction note.** This feature was extracted from `004-service-catalog` because ServiceRegion crosses coverage modeling, maps, inspector assignment, service groups, marketplace behavior, and property geography. It is now the canonical specification for the geographic coverage domain.

## User Scenarios & Testing

### User Story 1 — Operator defines a geographic service region for a tenant (Priority: P1)

- **Status**: IMPLEMENTED (~~DIVERGENCE~~ RESOLVED — tenant scoping added in CORRECTION-004, 2026-04-07)
- **Source**: code + dossier

An Admin Master or Operator draws a polygon on a map (or submits GeoJSON coordinates) to define a named geographic area where a tenant's inspection services operate. The region carries a display color for map visualization and is immediately active. Each region belongs to exactly one tenant and region names are unique within that tenant.

**Why this priority**: Without regions, no geographic grouping of appointments is possible. Regions are the foundation for service groups, marketplace matching, and inspector assignment.

**Independent Test**: As OP, create a region "Sydney CBD" with a valid Polygon GeoJSON and color `#3b82f6` for own tenant. List regions for that tenant and confirm the new region appears. Attempt to create a second region with the same name for the same tenant — expect `REGION_NAME_CONFLICT`. Create a region with the same name for a different tenant (as AM) — expect success.

**Acceptance Scenarios**:

1. **Given** an AM actor, **When** they submit a create request with `tenantId`, `name`, valid `geojson` (Polygon), and optional `color`, **Then** an active region is created under that tenant, and an audit record is written.
2. **Given** an OP actor, **When** they submit a create request without `tenantId`, **Then** the region is created under their own tenant (from JWT).
3. **Given** a valid create request with a `name` that already exists for the same tenant, **When** submitted, **Then** the request fails with `REGION_NAME_CONFLICT`.
4. **Given** a region name that exists in tenant A, **When** AM creates a region with the same name in tenant B, **Then** the request succeeds (names are unique per tenant, not globally).
5. **Given** a GeoJSON with fewer than 4 coordinates per ring, or an open ring (first != last coordinate), **When** submitted, **Then** the request fails with `VALIDATION_ERROR`.
6. **Given** a CL_ADMIN, CL_USER, or INSP actor, **When** they attempt to create a region, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 2 — System resolves which regions cover a set of appointment properties (Priority: P1)

- **Status**: IMPLEMENTED (~~DIVERGENCE~~ RESOLVED — resolve query tenant-scoped in CORRECTION-004, 2026-04-07)
- **Source**: code

When the operational team prepares a service group for the marketplace, the system must determine which regions contain each appointment's property. The resolution uses the canonical geospatial rule: a property's coordinates fall inside a region's polygon boundary (inclusive of boundary points). The response includes the count of active inspectors assigned to each matched region and lists any appointments with no matching region.

**Why this priority**: Region resolution drives the entire marketplace and inspector assignment flow. Without it, service groups cannot be published and inspectors cannot be matched to appointments.

**Independent Test**: Seed 3 regions and 5 properties (with coordinates). Create 5 appointments. Call the resolve endpoint with the appointment IDs. Verify that each appointment is matched to the correct region(s) based on `ST_Contains`. Verify appointments with out-of-region properties appear in `unmatchedAppointmentIds`.

**Acceptance Scenarios**:

1. **Given** a set of appointment IDs (max 25), **When** an AM or OP calls the resolve endpoint, **Then** the system returns regions matching each appointment's property location, the inspector count per region, and a list of unmatched appointment IDs.
2. **Given** a property whose coordinates fall exactly on a region boundary, **When** resolved, **Then** the property is considered inside the region (boundary-inclusive).
3. **Given** an appointment whose property has no coordinates (geocoding pending or failed), **When** resolved, **Then** that appointment appears in `unmatchedAppointmentIds`.
4. **Given** an appointment whose property coordinates fall in no active region, **When** resolved, **Then** that appointment appears in `unmatchedAppointmentIds`.
5. **Given** a tenant-scoped resolve, **When** executed, **Then** only regions belonging to the appointment's tenant are considered — cross-tenant regions are never matched. (~~DIVERGENCE~~ RESOLVED: tenant scoping enforced since CORRECTION-004.)
6. **Given** a non-AM/OP actor, **When** they call the resolve endpoint, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 3 — Operator updates or deactivates a region (Priority: P2)

- **Status**: IMPLEMENTED
- **Source**: code

An operator edits a region's name, polygon shape, or color, or deactivates it when the coverage area is no longer served. Deactivated regions are excluded from marketplace matching and new service group assignments but remain visible for historical reference and audit. Deactivation requires a reason.

**Why this priority**: Operational flexibility — agencies adjust coverage without losing traceability.

**Independent Test**: Create a region, update its name and polygon. Deactivate it with a reason. Verify it no longer appears in resolve results. Verify it still appears when listing with `status=INACTIVE` filter.

**Acceptance Scenarios**:

1. **Given** an AM or OP actor and an existing active region, **When** they submit a patch with updated `name`, `geojson`, or `color`, **Then** the fields are updated, the geospatial column is regenerated, and an audit record with `before`/`after` is written.
2. **Given** an update that would create a duplicate name within the same tenant, **When** submitted, **Then** the request fails with `REGION_NAME_CONFLICT`.
3. **Given** an AM or OP actor and an active region with no published service groups referencing it, **When** they call the deactivate endpoint with a `reason`, **Then** the region becomes `INACTIVE` and an audit record with the reason is written.
4. **Given** an active region referenced by a published service group, **When** deactivation is attempted, **Then** the request fails with `SERVICE_REGION_HAS_PUBLISHED_GROUPS`.
5. **Given** an inactive region, **When** the resolve endpoint runs, **Then** the inactive region is excluded from matching.
5. **Given** a CL_ADMIN or below, **When** they attempt to update or deactivate a region, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 4 — Operator assigns inspectors to regions (Priority: P1)

- **Status**: IMPLEMENTED
- **Source**: code

An operator assigns one or more inspectors to a region (or a region to an inspector). This mapping determines which inspectors are eligible to accept appointments within that geographic area. Inspectors are global/multi-tenant entities — a single inspector may be assigned to regions across multiple tenants via their `clientEligibilityJson`. The assignment is a many-to-many relationship via the `InspectorRegion` join table.

**Why this priority**: Without inspector-region assignments, the marketplace cannot filter inspectors by geographic coverage.

**Independent Test**: Assign inspector A to regions R1 and R2. Query inspector A's regions — expect R1 and R2. Reassign to only R3. Query again — expect only R3 (full replacement). Query the inspector count for R1 — expect 0.

**Acceptance Scenarios**:

1. **Given** an AM or OP actor and a valid inspector ID and list of region IDs, **When** they set the inspector's regions, **Then** the previous mappings are replaced with the new set and an audit record is written.
2. **Given** a region ID that does not exist, **When** included in the assignment, **Then** the request fails with `SERVICE_REGION_NOT_FOUND`.
3. **Given** an inspector assigned to a region, **When** the region is queried for inspector count, **Then** the count includes this inspector.
4. **Given** an inspector with regions across multiple tenants, **When** a tenant-scoped query lists regions for that inspector, **Then** only regions belonging to the queried tenant are returned.

---

### User Story 5 — Operator deletes a region (Priority: P3)

- **Status**: IMPLEMENTED
- **Source**: code

An operator permanently removes a region. Only inactive regions can be deleted. Deletion cascades `InspectorRegion` rows. Regions referenced by service groups (`service_region_id`) cannot be deleted due to the foreign key constraint (`onDelete: Restrict`).

**Why this priority**: Cleanup operation for regions that are no longer relevant.

**Independent Test**: Deactivate a region, then delete it. Verify the region is gone. Attempt to delete an active region — expect `SERVICE_REGION_STILL_ACTIVE`. Attempt to delete a region referenced by a service group — expect `SERVICE_REGION_IN_USE`.

**Acceptance Scenarios**:

1. **Given** an AM or OP actor and an inactive region with no service group references, **When** they call delete, **Then** the region and its `InspectorRegion` rows are hard-deleted, and an audit record is written.
2. **Given** an active region, **When** delete is attempted, **Then** the request fails with `SERVICE_REGION_STILL_ACTIVE`.
3. **Given** an inactive region referenced by a service group, **When** delete is attempted, **Then** the request fails with `SERVICE_REGION_IN_USE`.
4. **Given** a CL_ADMIN or below, **When** they attempt to delete, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 6 — Operator lists and browses regions for administration (Priority: P2)

- **Status**: IMPLEMENTED
- **Source**: code

An operator or client user browses the region catalog for a tenant with pagination, status filter, and text search. The list shows all regions including their polygon, color, status, and creation metadata. AM can query any tenant by supplying `tenantId`; all other roles see only their own tenant's regions.

**Why this priority**: Required for region administration, map visualization, and service group configuration.

**Independent Test**: Seed 10 regions across 2 tenants. As OP of tenant A, list regions — expect only tenant A's regions. Filter by `status=ACTIVE` — expect only active ones. Search by name substring — expect matching results.

**Acceptance Scenarios**:

1. **Given** an AM actor with `tenantId` filter, **When** they list regions, **Then** only that tenant's regions are returned.
2. **Given** an OP, CL_ADMIN, or CL_USER actor, **When** they list regions, **Then** only their own tenant's regions are returned (tenant from JWT).
3. **Given** a `status` filter, **When** applied, **Then** only regions matching that status are returned.
4. **Given** a `search` term, **When** applied, **Then** only regions whose name matches the substring are returned.
5. **Given** an INSP actor, **When** they list regions, **Then** only regions the inspector is personally assigned to (via `InspectorRegion`) are returned — unassigned regions are excluded. (`APPROVED RULE` — inspectors see only their own coverage areas for the PWA map.)

---

### User Story 7 — Property coordinates are matched against regions for geographic classification (Priority: P1)

- **Status**: PARTIALLY IMPLEMENTED (PostGIS `coordinates` column on properties declared but population inconsistent)
- **Source**: code + dossier

When a property has valid latitude/longitude coordinates, the system can determine which region(s) the property falls within. This is the foundational geospatial operation that drives region resolution (US2), marketplace matching (feature 005), and inspector assignment validation. The canonical rule is: a point is inside a region if `ST_Contains(region.geom, property.coordinates)` returns true (boundary-inclusive per PostGIS default).

**Why this priority**: Without property-to-region matching, the entire coverage model is non-functional.

**Independent Test**: Create a region with a known polygon. Create a property with coordinates inside the polygon. Run `ST_Contains` — expect true. Move the property coordinates outside — expect false. Place coordinates exactly on the boundary — expect true.

**Acceptance Scenarios**:

1. **Given** a property with valid coordinates inside a region's polygon, **When** region resolution runs, **Then** the property is matched to that region.
2. **Given** a property with coordinates on the polygon boundary, **When** resolved, **Then** the property is matched (boundary-inclusive).
3. **Given** a property with coordinates outside all regions, **When** resolved, **Then** the property is unmatched.
4. **Given** a property with null coordinates (geocoding pending/failed), **When** resolved, **Then** the property is unmatched.
5. **Given** a property whose coordinates fall inside multiple overlapping regions, **When** resolved, **Then** all matching regions are returned — the system does not pick a single winner. The consuming feature (service groups, marketplace) decides which region to use.

---

### Edge Cases

- **Overlapping regions**: Two or more regions within the same tenant may overlap geographically. This is allowed — the system does not prevent overlapping polygons. When a property falls in multiple regions, all are returned by the resolver. The consuming feature decides which to use (typically the service group's assigned region).
- **Zero-area or degenerate polygons**: A polygon with all points collinear (zero area) is accepted at the GeoJSON validation level but will never match any point via `ST_Contains`. This is a non-harmful edge case — no special error is needed.
- **Antimeridian crossing**: Polygons that cross the 180th meridian (antimeridian) may produce incorrect `ST_Contains` results with SRID 4326. This is accepted as out of scope — Properfy operates in defined markets (currently Australia/Brazil) where this does not apply.
- **Inspector cross-tenant regions**: An inspector may be assigned to regions in multiple tenants. The `InspectorRegion` join table has no `tenant_id` — the tenant scope is inherited from the `ServiceRegion` row. Queries that resolve inspector coverage within a tenant must join through `service_regions.tenant_id`.
- **Region deletion with active inspector assignments**: Hard delete cascades `InspectorRegion` rows, silently removing the inspector's coverage in that area. Operators should deactivate first and reassign inspectors before deleting.
- **Legacy `regions_json`**: The `inspectors` table carries a `regions_json` column that is **legacy/transitional**. The canonical source for inspector-region coverage is the `InspectorRegion` join table. `regions_json` should not be used for any new logic and is tracked for removal (see GAP-002).
- **PostGIS `geom` vs `geojson`**: Both are stored on the `service_regions` table. `geojson` (jsonb) is the application source of truth used by the frontend for rendering. `geom` (PostGIS Geometry) is populated from `geojson` on write and is used by spatial queries (`ST_Contains`). They must always be in sync — a write to `geojson` must also update `geom`.

## Requirements

### Functional Requirements

All FRs below are `Status: IMPLEMENTED, Source: code` unless otherwise noted.

#### Region CRUD

- **FR-001** (~~DIVERGENCE~~ RESOLVED — `tenant_id` added in CORRECTION-004): System MUST store service regions with a **mandatory `tenant_id`**. Every region belongs to exactly one tenant.
- **FR-002**: System MUST enforce `UNIQUE (tenant_id, name)` — region names are unique only within the same tenant. Names may repeat across tenants.
- **FR-003**: System MUST validate GeoJSON on create and update: `type` must be `Polygon`, each ring must have at least 4 coordinates, first coordinate must equal last (closed ring).
- **FR-004**: System MUST store both a `geojson` (jsonb, application source of truth) and a `geom` (PostGIS `GEOMETRY(Polygon, 4326)`) column. Writes to `geojson` must also update `geom` atomically.
- **FR-005**: System MUST allow AM to manage regions for any tenant (supplying `tenantId`) and OP to manage regions within their own tenant only (from JWT).
- **FR-006**: System MUST reject region management (create, update, deactivate, delete) from CL_ADMIN, CL_USER, and INSP roles with `FORBIDDEN`.
- **FR-007**: System MUST support region deactivation via a dedicated endpoint requiring a `reason`. Deactivated regions are excluded from marketplace matching and new service group assignments. Deactivation MUST be blocked if any **published** (active/in-marketplace) service group references the region — the operator must unpublish or reassign those groups first. Draft service groups may remain linked but cannot be published while the region is inactive.
- **FR-008**: System MUST support region hard delete only when the region is `INACTIVE` and not referenced by any service group (`onDelete: Restrict` on `ServiceGroup.service_region_id`).
- **FR-009**: System MUST cascade hard delete to `InspectorRegion` rows when a region is deleted.

#### Region Resolution (Geospatial)

- **FR-010**: System MUST resolve regions for a batch of appointment IDs (max 25) by matching each appointment's property coordinates against active region polygons using `ST_Contains(region.geom, property.coordinates)`.
- **FR-011** (~~DIVERGENCE~~ RESOLVED — tenant scoping enforced since CORRECTION-004): Region resolution MUST be tenant-scoped — each appointment is matched only against regions belonging to the same tenant as the appointment.
- **FR-012**: Boundary inclusion MUST be the default — points on the polygon boundary are considered inside.
- **FR-013**: Properties with null coordinates (geocoding pending/failed) MUST be reported as unmatched.
- **FR-014**: When a property falls inside multiple overlapping regions, ALL matching regions MUST be returned. The system does not select a single winner.
- **FR-015**: The resolve endpoint MUST return the count of active inspectors assigned to each matched region.
- **FR-016**: The resolve endpoint MUST return the list of appointment IDs that matched no region (`unmatchedAppointmentIds`).

#### Inspector-Region Assignment

- **FR-017**: System MUST maintain a many-to-many relationship between inspectors and regions via the `InspectorRegion` join table.
- **FR-018**: Inspector-region assignment MUST use a full-replacement strategy — setting an inspector's regions replaces all previous mappings.
- **FR-019**: Inspector-region queries within a tenant context MUST only return regions belonging to that tenant, even though the inspector may have assignments across multiple tenants.

#### Tenant Scoping

- **FR-020** (`APPROVED RULE, Source: dossier + constitution`): Every query that reads or writes service regions MUST be scoped by `tenant_id`. AM is the only role that may specify a target tenant; all other roles derive tenant from JWT.
- **FR-021**: INSP actors may read **only** regions they are personally assigned to via the `InspectorRegion` join table (needed for PWA map). The list endpoint for INSP MUST filter by the inspector's assigned region IDs. They MUST NOT see unassigned regions, and MUST NOT create/update/delete any region.

#### Audit

- **FR-022**: System MUST audit every region create, update, deactivate, and delete operation via the shared `AuditService`.
- **FR-023**: Region deactivation audit records MUST include the `reason` provided by the actor.
- **FR-024**: Inspector-region assignment changes MUST produce an audit record with `before`/`after` region lists.

### Key Entities

- **ServiceRegion** — A named geographic polygon owned by a single tenant. Key attributes: `id`, `tenant_id` (mandatory), `name`, `geojson` (Polygon), `geom` (PostGIS Geometry), `color`, `status` (`ACTIVE`/`INACTIVE`), `created_by_user_id`, timestamps. Uniqueness: `(tenant_id, name)`.
- **InspectorRegion** — Join table linking inspectors to regions. Key attributes: `inspector_id`, `region_id` (composite PK), `assigned_at`, `assigned_by`. Cascades on region delete.
- **RegionStatus** — Enum: `ACTIVE`, `INACTIVE`.
- **Property coordinates** (consumed, not owned) — `lat`/`lng` decimal columns and PostGIS `coordinates` point on the `properties` table. Owned by feature 003.
- **ServiceGroup.service_region_id** (consumed, not owned) — FK from service groups to regions. Owned by feature 005. Constrains region deletion via `onDelete: Restrict`.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Every region CRUD operation is tenant-scoped — no query returns or matches regions from a different tenant. Verified by integration tests with multi-tenant seed data.
- **SC-002**: Region resolution correctly matches properties to regions using spatial containment — verified by integration tests with known polygon/point pairs including boundary cases.
- **SC-003**: Properties outside all regions are reported as unmatched — verified by integration test.
- **SC-004**: Inspector-region assignments are tenant-aware — querying an inspector's regions within tenant A returns only tenant A's regions, even if the inspector serves multiple tenants. Verified by integration test.
- **SC-005**: Region deactivation immediately excludes the region from resolve results — verified by integration test (deactivate, then resolve, confirm absence).
- **SC-006**: Region deletion is blocked when referenced by a service group — verified by integration test.
- **SC-007**: Every create, update, deactivate, and delete produces exactly one audit record. Verified by integration test.
- **SC-008**: Region resolution responds within 200ms p95 for a batch of 25 appointments against a tenant with up to 50 regions. Verified by load test.

## Assumptions

- GeoJSON `Polygon` type (single exterior ring, optional holes) is sufficient for Phase 1. MultiPolygon support is tracked as GAP-005.
- PostGIS extension is available on the PostgreSQL instance (Supabase includes it by default).
- Coordinate reference system is EPSG:4326 (WGS 84) — standard for GPS/web mapping.
- Property coordinates are populated by the geocoding flow (feature 003). This feature does not own or trigger geocoding — it consumes the `coordinates` column as-is.
- The `regions_json` column on `inspectors` is legacy and will not be used by any new logic in this feature. Consolidation is tracked as GAP-002.
- Overlapping regions are allowed. The system does not enforce geographic non-overlap. Consuming features (service groups, marketplace) are responsible for selecting a single region when needed.
- Region CRUD is not available to CL_ADMIN. If this needs to change in the future, it would follow the same pattern as other CL_ADMIN capabilities gated by tenant settings (see 001#GAP-003).
- Hard delete is the chosen deletion strategy (not soft delete), matching the current implementation. Inactive regions serve the "historical reference" need.
- Inspector actors can read their own assigned regions (for PWA map visualization) but cannot manage any region.

## Clarifications

### Session 2026-04-06

- Q: What happens when a region is deactivated while published service groups reference it? → A: Block deactivation for active/published groups; draft groups may remain linked but cannot be published while the region is inactive.
- Q: Should inspectors see all tenant regions or only their assigned ones? → A: Inspectors see only regions they are personally assigned to.

## Known Gaps

| ID | Title | Impact | Context |
|---|---|---|---|
| ~~GAP-001~~ | ~~Tenant scoping correction (CORRECTION-004)~~ | ~~CRITICAL~~ | **RESOLVED** (commit `017a883`, 2026-04-07). `tenant_id` is now a non-nullable FK. All queries tenant-scoped. `UNIQUE(tenant_id, name)` constraint active. |
| GAP-002 | Consolidate inspector region data (legacy `regions_json`) | M | `inspectors.regions_json` is legacy/transitional. The canonical source is `InspectorRegion` join table. Need to deprecate and eventually remove `regions_json`. Coordinate with feature 008. |
| GAP-003 | PostGIS `geom` column population consistency | H | The `geom` column is populated on region create/update via raw SQL, but there is no verification that `geojson` and `geom` stay in sync. Need a validation check or trigger. Also, `properties.coordinates` PostGIS column population is inconsistent (tracked in 003#GAP-003). |
| ~~GAP-004~~ | ~~Resolve endpoint tenant scoping~~ | ~~CRITICAL~~ | **RESOLVED** (commit `017a883`, 2026-04-07). `resolveRegionsForAppointments` now filters by `tenant_id`. |
| GAP-005 | MultiPolygon support | L | Current validation accepts only `Polygon` type. Some agencies may need MultiPolygon for non-contiguous coverage areas (e.g., islands). |
| GAP-006 | Region overlap warnings | L | System allows overlapping regions silently. A future enhancement could warn operators when a new/updated region overlaps existing ones in the same tenant. |
| GAP-007 | Resolve endpoint batch size limit | L | Hard cap at 25 appointments per resolve call. For large service groups, this requires multiple calls. Consider increasing or adding a streaming/pagination approach. |
| GAP-008 | Inspector region assignment audit | M | Inspector-region assignment changes should produce audit records with before/after. Need to verify this is implemented. |
| GAP-009 | Region deactivation impact notifications | L | When a region is deactivated, published service groups referencing it and inspectors assigned to it are not notified. A future enhancement could alert affected parties. |
