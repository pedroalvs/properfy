# Data Model: Tenants & Branches

**Feature**: `002-tenants-branches`
**Status**: IMPLEMENTED
**Source**: `apps/backend/prisma/schema.prisma` (`Tenant`, `Branch`), `packages/shared/src/enums/tenant.ts`

All timestamps are `timestamptz`. All IDs are UUID v4. Column names follow `snake_case`; the Prisma client exposes them as `camelCase` to the application layer.

## Enums

### `TenantStatus`

```
PENDING | ACTIVE | INACTIVE
```

- `PENDING` — newly created, awaiting activation. CL users cannot authenticate yet. Default on creation.
- `ACTIVE` — live. Full platform access for the tenant's CL users.
- `INACTIVE` — deactivated. CL tokens rejected by auth middleware. Historical records preserved.

> **Activation path is not yet exposed via API.** See `spec.md` GAP-001.

### `BranchStatus`

```
ACTIVE | INACTIVE
```

- `ACTIVE` — default on creation. Branch operates normally.
- `INACTIVE` — deactivated. Cannot be assigned to new resources. Reactivation path not exposed (GAP-006).

## Entities

### `tenants`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `name` | varchar(200) | no | — | Display name of the agency. |
| `legal_name` | varchar(200) | no | — | **Global unique**, trimmed. Used for billing and legal documents. |
| `status` | `TenantStatus` | no | `PENDING` | |
| `timezone` | varchar(60) | no | `Australia/Sydney` | IANA timezone. Drives appointment scheduling defaults. |
| `currency` | char(3) | no | `AUD` | ISO 4217 code. Drives financial entries and billing. |
| `settings_json` | jsonb | no | `{}` | Per-tenant configuration (see below). |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | — | Soft delete. |

**Indexes**

- `UNIQUE (legal_name)` — includes rows where `deleted_at IS NOT NULL`.
- `(status)`
- `(deleted_at)`

**Invariants**

- `legal_name` is globally unique even across deleted and inactive tenants.
- `PENDING` is the only valid initial status; transitions to `ACTIVE` or `INACTIVE` happen through explicit use cases.
- `deleted_at IS NOT NULL` means the tenant is invisible to every read and write path except historical joins.
- `settings_json` is deep-merged on update — consumers of a partial `PATCH` must assume untouched keys are preserved.

### `settings_json` shape (Phase 1)

The Zod schema in `packages/shared/src/schemas/tenant.ts` exposes a **strict** subset:

| Key | Type | Default | Notes |
|---|---|---|---|
| `billingPeriod` | `'WEEKLY' \| 'BIWEEKLY' \| 'MONTHLY'` | `'MONTHLY'` | Consumed by feature 010-billing-ledger. |
| `notificationEmail` | email (max 254) | — | Optional. Target for operational notifications to the agency. |
| `timezone` | string (max 60) | — | Override at settings level; tenant-level `timezone` takes precedence if both present. |
| `customFields` | `Record<string, unknown>` | — | Escape hatch for unstructured per-tenant data. |

> **Legacy dossier requires additional keys** (branding, notification sender, billing day-of-week/month, feature flags, inspector offer config, email templates). These are tracked as GAP-002 and MUST NOT be assumed present by downstream code until GAP-002 is closed.

### `branches`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `tenant_id` | uuid | no | — | FK → `tenants.id`. |
| `name` | varchar(200) | no | — | Display name within the tenant. |
| `address_json` | jsonb | yes | — | Freeform address object (street, number, city, etc.). Shape not schema-enforced in Phase 1. |
| `contact_email` | varchar(254) | yes | — | Operational contact. |
| `status` | `BranchStatus` | no | `ACTIVE` | |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | — | Soft delete. |

**Indexes**

- `UNIQUE (tenant_id, name)` — case-sensitive in Phase 1. Case-insensitive comparison is GAP-007.
- `(tenant_id)`
- `(tenant_id, status)`
- `(deleted_at)`

**Invariants**

- A branch cannot exist without an active tenant at creation time (`CreateBranchUseCase` rejects `PENDING` and `INACTIVE` tenants with `TenantInactive`).
- Branch name uniqueness is scoped to the parent tenant. The same display name can appear in different tenants.
- Status changes only happen through explicit activate/deactivate use cases, never through `PATCH`.
- Deactivation is blocked by the open-appointment invariant (`IAppointmentChecker.hasOpenAppointmentsForBranch`).

## Relationships

```
tenants (1)
  ├── branches (0..*)
  ├── users (0..*)            [owned by feature 001]
  ├── properties (0..*)       [owned by feature 003]
  ├── price_rules (0..*)      [owned by feature 004]
  ├── appointments (0..*)     [owned by feature 006]
  ├── service_groups (0..*)   [owned by feature 005]
  ├── notifications (0..*)    [owned by feature 009]
  ├── notification_templates (0..*)
  ├── financial_entries (0..*) [owned by feature 010]
  └── appointment_time_slots (0..*) [owned by appointment-time-slot]

branches (1)
  ├── users (0..*)
  ├── properties (0..*)
  ├── price_rules (0..*)
  ├── appointments (0..*)
  └── appointment_time_slots (0..*)
```

Delete semantics for cross-feature FKs are tracked in each owning feature. As a general rule:

- **Tenant soft delete** (future) leaves child rows intact; business rules must treat them as orphaned.
- **Tenant hard delete** is not exposed via API (GAP-009); requires an ops runbook and cascade-safe cleanup.
- **Branch soft delete** (future) leaves child rows intact; users with that `branch_id` can be reassigned.

## Ports (domain interfaces)

### `ITenantRepository`

Methods (verified in `apps/backend/src/modules/tenant/domain/tenant.repository.ts`):

- `findById(id): TenantEntity | null` — excludes soft-deleted.
- `findByLegalName(legalName): TenantEntity | null` — excludes soft-deleted.
- `findAll(filters, pagination): TenantEntity[]`
- `count(filters): number`
- `save(tenant): void` — insert path.
- `update(tenantId, partial): void`

### `IBranchRepository`

- `findById(branchId, tenantId): BranchEntity | null`
- `findByName(tenantId, name): BranchEntity | null`
- `findAll(tenantId, filters, pagination): BranchEntity[]`
- `count(tenantId, filters): number`
- `countByTenantIds(tenantIds): Record<tenantId, number>` — used by `ListTenantsUseCase` for the `branchCount` aggregate.
- `save(branch): void`
- `update(branchId, tenantId, partial): void`

### `IAppointmentChecker`

Cross-module port implemented in infrastructure as `PrismaAppointmentChecker` (reads the appointment module's tables without importing its domain). `StubAppointmentChecker` is provided for unit tests only and must **never** be wired into production containers.

- `hasOpenAppointmentsForTenant(tenantId): boolean`
- `hasOpenAppointmentsForBranch(branchId): boolean`
- `hasOpenAppointmentsForProperty(propertyId): boolean` — reused by feature 003-properties.

"Open appointment" is defined as any appointment whose `status` is `DRAFT`, `AWAITING_INSPECTOR`, or `SCHEDULED`. The precise query lives in `prisma-appointment-checker.ts` and must stay in sync with feature 006's state machine.

## Audit Linkage

Every tenant/branch create, update, and deactivate produces a record written to `audit_logs` via the shared `AuditService`. Audit actions emitted by this feature:

- `tenant.created`
- `tenant.updated`
- `tenant.deactivated`
- `branch.created`
- `branch.updated`
- `branch.deactivated`

Each record includes `actorId`, `entityType`, `entityId`, `tenantId` (when applicable), `before`/`after` snapshots, and `reason` (on deactivation).

## Migration History

Phase 1 schema is already applied in `apps/backend/prisma/migrations/`. Any new columns, indexes, or settings keys required by Phase 2 gaps (notably GAP-002 and GAP-007) must go through expand/contract Prisma migrations generated alongside the code change.
