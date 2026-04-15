# Research: Service Regions

**Feature**: `013-service-regions`
**Date**: 2026-04-06
**Status**: Complete

## D-001: Tenant ID migration strategy for `service_regions`

- **Decision**: Expand/contract migration — add nullable `tenant_id` column, backfill from service group or operator context, then make NOT NULL and add unique constraint.
- **Rationale**: The expand/contract pattern is required by the constitution (Principle IV, migrations section). Adding a NOT NULL column directly would fail on existing rows. Backfill must determine the correct tenant for each existing region.
- **Backfill logic**: Existing regions are likely created by AM or OP users. The `created_by_user_id` column links to `users.tenant_id`. For AM-created regions (where `users.tenant_id` is NULL), the service groups referencing the region (`service_groups.tenant_id`) provide the tenant. If neither is available, manual assignment is required.
- **Migration steps**:
  1. Add `tenant_id UUID NULL` column with FK to `tenants.id`
  2. Backfill: set `tenant_id` from `service_groups.tenant_id` (via `service_groups.service_region_id`) for regions referenced by groups; fall back to `users.tenant_id` via `created_by_user_id`
  3. Verify no NULL rows remain; ALTER to NOT NULL
  4. Add `UNIQUE (tenant_id, name)` constraint
  5. Add index on `(tenant_id, status)` for list queries
- **Alternatives considered**: Hard delete and re-create (destructive, loses audit trail), soft migration with application-level enforcement only (risky, allows inconsistency).

## D-002: PostGIS spatial query pattern

- **Decision**: Use `ST_Contains(region.geom, property.coordinates)` for point-in-polygon matching, with GIST spatial index on `service_regions.geom`.
- **Rationale**: `ST_Contains` with PostGIS is the standard approach for point-in-polygon queries. GIST index makes this efficient even for large polygon sets. `ST_Contains` is boundary-inclusive by PostGIS default (uses `DE-9IM` pattern `T*F**FFF*`), matching the spec requirement.
- **Performance**: With a GIST index, `ST_Contains` on 50 polygons against 25 points is sub-millisecond. The 200ms p95 target is comfortably met.
- **Alternatives considered**: In-memory GeoJSON matching with turf.js (no spatial index, slow for large sets), database function with `ST_Within` (equivalent but less idiomatic for "region contains point").

## D-003: Tenant scoping for resolve query

- **Decision**: Add `WHERE sr.tenant_id = a.tenant_id` (or equivalent join) to the `resolveRegionsForAppointments` raw SQL query.
- **Rationale**: The current query joins `service_regions` to `properties` via `appointments` without any tenant filter. Since appointments carry `tenant_id`, joining `sr.tenant_id = a.tenant_id` scopes the spatial matching to the correct tenant.
- **Impact**: This changes behavior — regions from other tenants will no longer match. This is the correct behavior per the constitution and dossier.
- **Alternatives considered**: Filter in application layer (wastes DB resources on cross-tenant matches), use a materialized view (unnecessary complexity for this query volume).

## D-004: Deactivation guard for published service groups

- **Decision**: Before deactivating a region, query `service_groups` for any rows with `service_region_id = regionId` AND `status = 'PUBLISHED'` (or equivalent active marketplace status). Block with `SERVICE_REGION_HAS_PUBLISHED_GROUPS` if found.
- **Rationale**: Deactivating a region while published groups reference it would break the marketplace — inspectors would see groups with no valid coverage. Blocking deactivation forces the operator to unpublish or reassign first, maintaining data integrity.
- **Implementation**: Add a `countPublishedGroupsByRegionId(regionId)` method to the service-region repository (or query service-group repository via a port). The deactivation use case checks this count before proceeding.
- **Alternatives considered**: Auto-unpublish groups (surprising side effect, violates minimal impact), soft-warning without blocking (risk of orphaned marketplace offers).

## D-005: INSP list filtering by assigned regions

- **Decision**: When an INSP actor calls the list endpoint, filter by joining `inspector_regions` on the inspector's `inspectorId` (from `AuthContext`) and returning only regions linked to them.
- **Rationale**: Inspectors should only see regions they operate in (per clarification session). The `AuthContext` carries `inspectorId` for INSP role users. The join is: `service_regions JOIN inspector_regions ON sr.id = ir.region_id WHERE ir.inspector_id = authContext.inspectorId`.
- **Alternatives considered**: Return all tenant regions and filter in frontend (exposes operational data the inspector shouldn't see), restrict INSP from list endpoint entirely (blocks PWA map functionality).

## D-006: Inspector-region assignment audit

- **Decision**: The `setInspectorRegions` method must capture before/after region ID lists and produce an audit record.
- **Rationale**: FR-024 requires audit with before/after. The current implementation (`prisma-inspector.repository.ts` lines 173-209) does a delete-all + create-many without auditing.
- **Implementation**: Before the delete-many, read current region IDs. After the create-many, record `{ before: [...oldIds], after: [...newIds] }` via `AuditService`.
- **Alternatives considered**: Audit only additions/removals (more granular but harder to reconstruct full state), audit at the route level (misses programmatic calls).

## D-007: Test strategy for PostGIS-dependent tests

- **Decision**: Integration tests require a real PostgreSQL instance with PostGIS. Unit tests mock the repository port.
- **Rationale**: Constitution Principle III mandates integration tests hit a real database. PostGIS functions (`ST_Contains`, `ST_GeomFromGeoJSON`) cannot be meaningfully mocked. Unit tests for use cases mock the repository interface and test RBAC, validation, and orchestration logic.
- **Test fixtures**: Use well-known polygon/point pairs (e.g., a rectangle around a known city block) so results are deterministic and verifiable by inspection.
- **Alternatives considered**: In-memory PostGIS (no such tool exists), mocking ST_Contains results (misses the actual spatial logic).
