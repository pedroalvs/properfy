# Data Model: Properties

**Feature**: `003-properties`
**Status**: IMPLEMENTED
**Source**: `apps/backend/prisma/schema.prisma` (`Property`, `PropertyImport`, `PropertyType`, `GeocodingStatus`), `packages/shared/src/enums/property.ts`

All timestamps are `timestamptz`. All IDs are UUID v4. Column names follow `snake_case`; the Prisma client exposes them as `camelCase` to the application layer.

## Enums

### `PropertyType`

```
RESIDENTIAL | COMMERCIAL | INDUSTRIAL | RURAL
```

`Implementation decision` — the dossiê lists `type` as a field but does not enumerate values. New types require a migration but not a dossiê amendment.

### `GeocodingStatus`

`IMPLEMENTED (implementation decision)` — the dossiê mandates Mapbox geocoding with a `pending_geocode` fallback (`infra-tecnologia-production-ready.md:181`) but does not define this four-state enum or the transitions between states. The full state machine below is an implementation design.

```
PENDING | SUCCESS | FAILED | MANUAL
```

- `PENDING` — default on creation or after an address change without explicit coordinates. Job enqueued.
- `SUCCESS` — Mapbox returned valid coordinates; `lat`/`lng` populated.
- `FAILED` — Mapbox could not resolve the address. `lat`/`lng` remain null. Manual retry available.
- `MANUAL` — Operator provided explicit coordinates. The automatic geocoder will NOT overwrite this row.

State transitions (all `implementation decision`):

```
PENDING ─── geocode success ──▶ SUCCESS
PENDING ─── geocode failure ──▶ FAILED
SUCCESS ─── address change (no coords) ──▶ PENDING
SUCCESS ─── explicit coords ──▶ MANUAL
FAILED ──── manual requeue ──▶ PENDING
MANUAL ──── (locked — no automatic transition; see GAP-002 for unlock path)
```

## Entities

### `properties`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `tenant_id` | uuid | no | — | FK → `tenants.id`. |
| `branch_id` | uuid | yes | — | FK → `branches.id`. Optional. Must belong to the same tenant and be `ACTIVE` when set. |
| `property_code` | varchar(50) | no | — | Internal code assigned by the agency. |
| `type` | `PropertyType` | no | — | |
| `street` | varchar(300) | no | — | |
| `address_line_2` | varchar(200) | yes | — | Apartment, unit, floor, etc. |
| `suburb` | varchar(100) | no | — | |
| `postcode` | varchar(20) | no | — | |
| `state` | varchar(100) | no | — | |
| `country` | varchar(100) | no | `AU` | ISO alpha-2 in Phase 1 (not enforced at DB level). |
| `lat` | decimal(10,7) | yes | — | Latitude. |
| `lng` | decimal(10,7) | yes | — | Longitude. |
| `geocoding_status` | `GeocodingStatus` | no | `PENDING` | |
| `notes` | text | yes | — | Freeform. Max 2000 chars enforced at application level. |
| `rules_json` | jsonb | no | `{}` | Per-property scheduling rules. **This feature persists but does not own the shape.** The canonical schema is defined by feature 006-appointments. This feature treats the content as opaque (GAP-007). |
| `coordinates` | `GEOMETRY(Point, 4326)` | yes | — | PostGIS column declared via `Unsupported(...)`. Not populated in Phase 1 (GAP-003). |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | — | Soft delete. |

**Indexes**

- `UNIQUE (tenant_id, property_code)` — per-tenant unique code.
- `(tenant_id)`
- `(tenant_id, type)`
- `(branch_id)`
- `(deleted_at)`

**Invariants**

- `deleted_at IS NOT NULL` ⇒ property is invisible to reads, writes, and FK resolution (except historical joins on `appointments`).
- `branch_id IS NOT NULL` ⇒ `branch.tenant_id = property.tenant_id` and `branch.status = ACTIVE` at the time of write.
- `geocoding_status = MANUAL` ⇒ `lat IS NOT NULL AND lng IS NOT NULL`.
- `geocoding_status = SUCCESS` ⇒ `lat IS NOT NULL AND lng IS NOT NULL`.
- Address component changes without explicit `latitude`/`longitude` in the same patch MUST reset `geocoding_status` to `PENDING` and enqueue a geocoding job.
- Patches with explicit `latitude` AND `longitude` MUST set `geocoding_status = MANUAL` and MUST NOT enqueue a geocoding job.
- `rules_json` is replaced wholesale on update (no deep-merge) in Phase 1.

### `property_imports`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `tenant_id` | uuid | no | — | FK → `tenants.id`. Every import is scoped to a single tenant. |
| `status` | varchar(20) | no | `PENDING` | Values used by the worker: `PENDING`, `PROCESSING`, `DONE`, `FAILED`. Not a DB enum in Phase 1 — tracked for possible enum migration. |
| `file_key` | varchar(500) | no | — | Object-storage key (`imports/properties/<importId>/<filename>`). |
| `original_filename` | varchar(255) | no | — | |
| `total_rows` | int | no | `0` | Set by the worker after parsing. |
| `success_count` | int | no | `0` | Rows that produced a created property. |
| `error_count` | int | no | `0` | Rows that failed validation or insertion. |
| `errors_json` | jsonb | yes | — | Row-level error list, populated by the worker. |
| `created_by_user_id` | uuid | no | — | FK → `users.id`. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes**

- `(tenant_id)`
- `(status)`
- `(created_by_user_id)`
- `(created_at)`

**Invariants**

- `status IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED')`. Any other value is a bug.
- `status = DONE` ⇒ `total_rows = success_count + error_count` (modulo rows rejected before parse).
- The `file_key` MUST match `imports/properties/<id>/<original_filename>` and the object must exist in storage when the worker starts.
- `errors_json` shape: `[{ row: number, field?: string, code: string, message: string }]` — informal, not Zod-validated (GAP-008 candidate).

## Ports (domain interfaces)

### `IPropertyRepository`

- `findById(propertyId, tenantId: string | null): PropertyEntity | null` — passing `null` is an AM-only escape for cross-tenant access. OP passes their own `tenantId`.
- `findByPropertyCode(code, tenantId): PropertyEntity | null`
- `findAllWithBranch(filters, pagination): Array<{ property: PropertyEntity; branchName: string | null }>` — uses a single JOIN to avoid N+1 on the branch lookup.
- `count(filters): number`
- `save(property): void`
- `update(propertyId, tenantId, partial): void`

### `IPropertyImportRepository`

- `save(entity): void`
- `findById(importId, tenantId): PropertyImportEntity | null`
- `update(importId, partial): void` — used by the worker to push progress.

### `IGeocodingService`

- `geocode(address): { lat, lng } | null` — stub returns null; Mapbox adapter calls the real API.
- Errors are caught at the adapter layer and surfaced as `null` so the worker can set `FAILED` without throwing.

### `IAddressLookupService`

- `search(query, { limit, country }): Array<AddressSuggestion>` — typeahead.

### Cross-module (reused)

- `ITenantRepository.findById` — read-only. Used by `CreatePropertyUseCase` to enforce `tenant.isActive()`.
- `IBranchRepository.findById` — read-only. Used by create/update to validate `branch.isActive()` and tenant membership.
- `IAppointmentChecker.hasOpenAppointmentsForProperty` — used by delete use case.

## Relationships

```
tenants (1) [feature 002]
  └── properties (0..*)
         ├── branch      [optional, feature 002]
         └── appointments (0..*) [feature 006]

property_imports (1) [feature 003]
  └── created_by → users [feature 001]
```

- `properties.tenant_id → tenants.id` — required.
- `properties.branch_id → branches.id` — optional; `ON DELETE SET NULL` is NOT set in the schema, so branch hard delete is blocked by FK.
- `properties.appointments` — reverse relation; `Appointment.property_id` FK owned by feature 006.
- `property_imports.created_by_user_id → users.id` — required; deletion of the originating user is blocked by FK.

## Side Effects by Use Case

| Use case | Job enqueued | Storage write | Audit action |
|---|---|---|---|
| Create property | `property.geocode` (non-fatal on failure) | — | `property.created` |
| Update property (address change, no coords) | `property.geocode` | — | `property.updated` |
| Update property (explicit coords) | — | — | `property.updated` |
| Geocode property | `property.geocode` | — | (none currently — verify and promote to audit if needed) |
| Delete property | — | — | `property.deleted` |
| Import properties | `property.import` | Supabase Storage (file) | `property.imported` per row (GAP-005 for batch record) |

## Migration History

Phase 1 schema applied in `apps/backend/prisma/migrations/`. Any addition (e.g., hash column for import idempotency in GAP-006, PostGIS backfill in GAP-003, shared address schema in GAP-001) requires an expand/contract migration alongside the code change.
