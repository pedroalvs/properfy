# Data Model: Service Catalog

**Feature**: `004-service-catalog`
**Status**: IMPLEMENTED
**Source**: `apps/backend/prisma/schema.prisma` (`ServiceType`, `ServicePriceRule`, `ServiceRegion`, `InspectorRegion`, + enums)

All timestamps are `timestamptz`. All IDs are UUID v4 unless noted. Column names follow `snake_case`; the Prisma client exposes them as `camelCase`.

## Enums

### `ServiceTypeFlowType`

```
ROUTINE | INGOING | OUTGOING
```

- `ROUTINE` — recurring inspections during tenancy. `requiresTenantConfirmation` defaults to `true` at the schema level.
- `INGOING` — start-of-tenancy inspection. Per the dossier (CLAUDE.md section 8), does not require tenant confirmation.
- `OUTGOING` — end-of-tenancy inspection. Does not require tenant confirmation.

> The `requiresTenantConfirmation` flag is stored per service type, not hardcoded by flow. The dossier guidance is the APPROVED rule; the DB lets the operator override it per row. See GAP-001 for the default-value drift.

### `ServiceTypeStatus`

```
ACTIVE | INACTIVE
```

### `PayoutType`

```
FIXED | PERCENTAGE
```

- `FIXED` — `payout_value` is a flat currency amount paid to the inspector.
- `PERCENTAGE` — `payout_value` is a percentage of `price_amount` (e.g., `0.60` or `60.00` — verify unit convention in feature 010-billing when consuming).

### `PriceRuleStatus`

```
ACTIVE | INACTIVE
```

### `RegionStatus`

```
ACTIVE | INACTIVE
```

## Entities

### `service_types`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `code` | varchar(50) | no | — | **Globally unique**. Uppercased on write by Zod schema. |
| `name` | varchar(200) | no | — | Display name. |
| `flow_type` | `ServiceTypeFlowType` | no | — | |
| `requires_tenant_confirmation` | boolean | no | `true` | DB default. Drives appointment state machine (feature 006). |
| `status` | `ServiceTypeStatus` | no | `ACTIVE` | |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes**

- `UNIQUE (code)`
- `(status)`

**Invariants**

- `code` is globally unique. The uniqueness is case-insensitive in spirit (values are uppercased on write); callers may read with any case and should be normalized in the repository layer.
- Service types are never hard-deleted. `status = INACTIVE` is the only terminal state (GAP-008 for a possible hard-delete policy).
- Changes to `flow_type` and `requires_tenant_confirmation` affect all current and future appointments referencing the row — reviewers must consider this before approving updates.

### `service_price_rules` (Pricing Rule)

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `tenant_id` | uuid | no | — | FK → `tenants.id`. |
| `service_type_id` | uuid | no | — | FK → `service_types.id`. |
| `branch_id` | uuid | yes | — | FK → `branches.id`. Null means "tenant-wide fallback". |
| `price_amount` | decimal(12,2) | no | — | Charged to the tenant. Currency comes from `Tenant.currency` (feature 002). |
| `payout_type` | `PayoutType` | no | — | |
| `payout_value` | decimal(12,2) | no | — | Flat amount when `FIXED`; percent when `PERCENTAGE`. |
| `bonus_rule_json` | jsonb | yes | — | Opaque. Owned by feature 010 (GAP-003). |
| `status` | `PriceRuleStatus` | no | `ACTIVE` | |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes**

- `UNIQUE (tenant_id, service_type_id, branch_id)` — enforced by DB. Note: Postgres allows multiple NULLs in a unique constraint, so the application-layer duplicate check must compare `branch_id IS NULL` explicitly (GAP-005).
- `(tenant_id)`
- `(service_type_id)`
- `(branch_id)`

**Invariants**

- Exactly one active tenant-level rule per `(tenant_id, service_type_id)` — enforced at the application layer. See GAP-005 for the verification task.
- Branch-level rules (`branch_id IS NOT NULL`) MUST reference a branch that belongs to the same tenant.
- `resolvePricingRule(rules, branchId)` (pure domain function) returns the active branch-level rule if present, otherwise the active tenant-level rule, otherwise `null`.
- Rules are never hard-deleted. `status = INACTIVE` is the only terminal state.
- No currency field — currency is inherited from `Tenant.currency` at read time (GAP-002).

### `service_regions`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `tenant_id` | uuid | no | — | FK -> `tenants.id`. **CORRECTION (2026-04-06)**: Currently missing in the codebase. Must be added. |
| `name` | varchar(255) | no | — | |
| `geom` | `GEOMETRY(Polygon, 4326)` | yes | — | PostGIS column declared via `Unsupported(...)`. **Not populated in Phase 1** (GAP-004). |
| `geojson` | jsonb | no | `{}` | Application source of truth for polygon shape. Zod-validated `{type:"Polygon", coordinates:[[[lng,lat]...]]}`. |
| `color` | varchar(20) | no | `#3b82f6` | Presentation color for the UI. |
| `status` | `RegionStatus` | no | `ACTIVE` | |
| `created_by_user_id` | uuid | yes | — | FK → `users.id`. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes**

- `UNIQUE (tenant_id, name)` -- region names are unique per tenant.
- `(tenant_id)`
- `(status)`

**Invariants**

- `tenant_id` is required on every region row. Queries must always be scoped by tenant.
- `geojson` is the source of truth; `geom` is declared for future spatial queries but currently ignored.
- An `ACTIVE` region cannot be deleted — must go through `deactivate` first.
- Deleting an `INACTIVE` region cascades to `inspector_regions` (via `onDelete: Cascade`). `IMPLEMENTED (implementation decision)` — the dossiê favors deactivation/controlled retirement; hard delete with cascade is not a dossiê-mandated behavior.
- Shared schema currently restricts to `Polygon` (single exterior ring + optional holes). `MultiPolygon` and hole support tracked as GAP-006.

### `inspector_regions` (join table)

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `inspector_id` | uuid | no | — | FK → `inspectors.id`, `ON DELETE CASCADE`. |
| `region_id` | uuid | no | — | FK → `service_regions.id`, `ON DELETE CASCADE`. |
| `assigned_at` | timestamptz | no | `now()` | |
| `assigned_by` | uuid | yes | — | Actor user id. No FK (string only). |

**Indexes**

- `PRIMARY KEY (inspector_id, region_id)`
- `(region_id)`

**Invariants**

- Many-to-many: an inspector can cover multiple regions (across multiple tenants), and a region can have multiple inspectors.
- The inspector is a **global/multi-tenant** entity, but each `InspectorRegion` row links to a **tenant-scoped** `ServiceRegion` — the tenant of the region defines the operational context of the coverage mapping. An inspector covering 3 tenants would have separate region mappings per tenant.
- Writing/reading this table is owned by the **inspector** module (not this feature). The resolve-regions use case only reads it via `IServiceRegionRepository.countActiveInspectorsInRegion`.

## Ports (domain interfaces)

### `IServiceTypeRepository`

- `findById(id): ServiceTypeEntity | null`
- `findByCode(code): ServiceTypeEntity | null` — used for uniqueness check and appointment lookups.
- `findAll(filters, pagination): ServiceTypeEntity[]`
- `count(filters): number`
- `save(entity): void`
- `update(id, partial): void`

### `IServiceRegionRepository`

- `findById(id): ServiceRegionEntity | null`
- `findAll(filters, pagination): ServiceRegionEntity[]`
- `count(filters): number`
- `save(entity): void`
- `update(id, partial): void`
- `delete(id): void` — cascade-safe (enforced by FK).
- `resolveRegionsForAppointments(appointmentIds): Array<{ regionId, regionName, color, matchedAppointmentIds: string[] }>` — in-memory GeoJSON matching today (GAP-004). Must scope by the appointment's `tenant_id` once regions are tenant-scoped. The dossiê recommends that a point on the polygon boundary counts as valid coverage; the future PostGIS implementation should use `ST_Intersects` (includes boundary) rather than strict `ST_Contains` (excludes boundary) to align with this rule.
- `countActiveInspectorsInRegion(regionId): number`

### `IPricingRuleRepository`

- `findByUnique(tenantId, serviceTypeId, branchId: string | null): PricingRuleEntity | null` — must match `IS NULL` explicitly (GAP-005).
- `findAll(filters, pagination): PricingRuleEntity[]`
- `findByTenantAndServiceType(tenantId, serviceTypeId): PricingRuleEntity[]` — used by the resolver to pre-fetch candidates.
- `count(filters): number`
- `save(entity): void`
- `update(id, partial): void`

### Domain function

`resolvePricingRule(rules: PricingRuleEntity[], branchId: string | null): PricingRuleEntity | null`

- Filters to `status = ACTIVE`.
- If `branchId` is set and an active rule with matching `branchId` exists → return it.
- Otherwise return the active rule with `branchId === null`.
- Otherwise return `null`.

Pure function. No I/O. Unit-testable without any mocks.

## Relationships

```
tenants (1) [feature 002]
  └── service_price_rules (0..*)

branches (0..*) [feature 002]
  └── service_price_rules (0..*, optional FK)

service_types (1)
  ├── service_price_rules (0..*)
  ├── appointments (0..*)      [feature 006]
  └── service_groups (0..*)    [feature 005]

service_regions (1)
  ├── inspector_regions (0..*)  [owned by inspector module]
  └── service_groups (0..*)     [feature 005]

users (1) [feature 001]
  └── service_regions (0..*, via created_by_user_id)
```

- `service_price_rules.tenant_id → tenants.id` — required.
- `service_price_rules.branch_id → branches.id` — optional.
- `service_price_rules.service_type_id → service_types.id` — required.
- `service_regions.created_by_user_id → users.id` — nullable (seed data may have no author).
- `inspector_regions` cascades on delete of either side.

## Audit Linkage

Actions emitted via `AuditService`:

- `service_type.created`, `service_type.updated`
- `service_region.created`, `service_region.updated`, `service_region.deactivated`, `service_region.deleted`
- `pricing_rule.created`, `pricing_rule.updated`

`service_region.deactivated` carries the supplied `reason`. Other actions carry `before`/`after` snapshots.

## Migration History

Phase 1 schema applied in `apps/backend/prisma/migrations/`. Phase 2 items that change column semantics (notably GAP-004 PostGIS backfill, GAP-006 multi-polygon widening, GAP-007 pricing history table) require expand/contract migrations alongside the code change.
