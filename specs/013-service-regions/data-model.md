# Data Model: Service Regions

**Feature**: `013-service-regions`
**Status**: IMPLEMENTED (with DIVERGENCE — `tenant_id` missing)
**Source**: `apps/backend/prisma/schema.prisma` (`ServiceRegion`, `InspectorRegion`, `RegionStatus`)

All timestamps are `timestamptz`. All IDs are UUID v4. Column names follow `snake_case`; the Prisma client exposes them as `camelCase` to application code.

## Enums

### `RegionStatus`

```
ACTIVE | INACTIVE
```

- `ACTIVE` — Default on creation. Included in region resolution and marketplace matching.
- `INACTIVE` — Deactivated by operator (with reason). Excluded from region resolution, marketplace matching, and service group publication. Visible in admin list with `status=INACTIVE` filter.

## Entities

### `service_regions`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `tenant_id` | uuid | no | — | **CORRECTION (2026-04-06)**: Currently missing in the codebase. Must be added via expand/contract migration. FK -> `tenants.id`. |
| `name` | varchar(255) | no | — | Display name. Unique within tenant. |
| `geom` | `GEOMETRY(Polygon, 4326)` | yes | — | PostGIS column. Populated from `geojson` on create/update via `ST_GeomFromGeoJSON`. Used by spatial queries (`ST_Contains`). Declared as `Unsupported(...)` in Prisma. |
| `geojson` | jsonb | no | `{}` | Application source of truth for polygon shape. GeoJSON `Polygon` type. |
| `color` | varchar(20) | no | `#3b82f6` | Hex or CSS color for map visualization. |
| `status` | `RegionStatus` | no | `ACTIVE` | |
| `created_by_user_id` | uuid | yes | — | FK -> `users.id`. The user who created the region. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes**

- `UNIQUE (tenant_id, name)` — region names unique per tenant. **TO BE ADDED** (currently no uniqueness constraint).
- `(tenant_id, status)` — list queries filter by tenant and optionally by status. **TO BE ADDED**.
- `(status)` — exists currently.
- `GIST (geom)` — spatial index for `ST_Contains` queries. **TO BE ADDED** if not already present.

**Invariants**

- `tenant_id IS NOT NULL` — every region belongs to exactly one tenant.
- `geojson` and `geom` must represent the same polygon — a write to `geojson` must also update `geom` atomically.
- `status = INACTIVE` is a precondition for hard delete.
- Deactivation is blocked if any published service group references this region.
- Name uniqueness is scoped to `tenant_id` — the same name may exist in different tenants.

### `inspector_regions`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `inspector_id` | uuid | no | — | Composite PK part 1. FK -> `inspectors.id` (`onDelete: Cascade`). |
| `region_id` | uuid | no | — | Composite PK part 2. FK -> `service_regions.id` (`onDelete: Cascade`). |
| `assigned_at` | timestamptz | no | `now()` | |
| `assigned_by` | uuid | yes | — | The user who made the assignment. |

**Indexes**

- `(inspector_id, region_id)` — composite PK.
- `(region_id)` — for reverse lookups (inspectors in a region).

**Invariants**

- Assignment is many-to-many: an inspector may serve multiple regions; a region may have multiple inspectors.
- Full-replacement semantics: setting an inspector's regions deletes all existing rows and inserts the new set.
- Cascade on region delete: deleting a region removes all `inspector_regions` rows for that region.
- Cascade on inspector delete: deleting an inspector removes all their `inspector_regions` rows.
- Tenant scope is inherited from the `service_regions.tenant_id` — the join table itself has no `tenant_id`.

## Runtime-only Types (not persisted)

### `ResolvedRegion`

Returned by the resolve endpoint. Computed by spatial matching.

| Field | Type | Notes |
|---|---|---|
| `regionId` | string (uuid) | |
| `regionName` | string | |
| `color` | string | |
| `matchedAppointmentCount` | number | How many of the queried appointments fall in this region. |
| `inspectorCount` | number | Active inspectors assigned to this region. |

### `ResolveRegionsOutput`

| Field | Type | Notes |
|---|---|---|
| `regions` | `ResolvedRegion[]` | Regions that matched at least one appointment. |
| `totalAppointments` | number | Total appointments in the query. |
| `unmatchedAppointmentIds` | string[] | Appointments whose properties matched no active region. |

## Relationships

```
tenants (feature 002) ──── service_regions (0..*)
                                  │
                                  ├── inspector_regions (0..*) ──── inspectors (feature 008)
                                  │
                                  └── service_groups (0..*) (feature 005, FK: service_region_id)
                                        │
                                        └── appointments (0..*) (feature 006)
                                              │
                                              └── properties (feature 003, coordinates used by ST_Contains)
```

- `service_regions.tenant_id -> tenants.id` — mandatory. Deleting a tenant requires resolving region rows first.
- `service_regions.created_by_user_id -> users.id` — nullable. Set at creation time.
- `inspector_regions.inspector_id -> inspectors.id` — cascade delete.
- `inspector_regions.region_id -> service_regions.id` — cascade delete.
- `service_groups.service_region_id -> service_regions.id` — `onDelete: Restrict`. Blocks region deletion if groups reference it.

## Audit Linkage

Region operations write records to the shared `audit_logs` table (owned by feature 011-reports-audit). The service-region module does not store audit rows; it only produces them via `AuditService`.

Audited operations:
- `service_region.created` — with full entity snapshot
- `service_region.updated` — with `before`/`after` diff
- `service_region.deactivated` — with `reason`
- `service_region.deleted` — with entity snapshot
- `inspector_region.assignment_changed` — with `before`/`after` region ID lists

## Migration Plan

### Step 1: Expand (add `tenant_id` nullable)

```sql
ALTER TABLE service_regions ADD COLUMN tenant_id UUID REFERENCES tenants(id);
```

### Step 2: Backfill

```sql
-- From service groups (most reliable: groups are tenant-scoped)
UPDATE service_regions sr
SET tenant_id = (
  SELECT DISTINCT sg.tenant_id
  FROM service_groups sg
  WHERE sg.service_region_id = sr.id
  LIMIT 1
)
WHERE sr.tenant_id IS NULL;

-- Fallback: from creator user
UPDATE service_regions sr
SET tenant_id = u.tenant_id
FROM users u
WHERE sr.created_by_user_id = u.id
  AND u.tenant_id IS NOT NULL
  AND sr.tenant_id IS NULL;
```

### Step 3: Contract (make NOT NULL, add constraints)

```sql
ALTER TABLE service_regions ALTER COLUMN tenant_id SET NOT NULL;
CREATE UNIQUE INDEX uq_service_regions_tenant_name ON service_regions (tenant_id, name);
CREATE INDEX idx_service_regions_tenant_status ON service_regions (tenant_id, status);
```

### Step 4: Spatial index (if not exists)

```sql
CREATE INDEX IF NOT EXISTS idx_service_regions_geom ON service_regions USING GIST (geom);
```
