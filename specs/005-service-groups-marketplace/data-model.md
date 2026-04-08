# Data Model: Service Groups & Marketplace

**Feature**: `005-service-groups-marketplace`
**Status**: IMPLEMENTED
**Source**: `apps/backend/prisma/schema.prisma` (`ServiceGroup`, `ServiceGroupStatus`, `PriorityMode`, `ServiceGroupExceptionType`), `apps/backend/src/modules/service-group/domain/**`

All timestamps are `timestamptz`. All IDs are UUID v4. Column names follow `snake_case`; the Prisma client exposes them as `camelCase`.

## Enums

### `ServiceGroupStatus`

`IMPLEMENTED (implementation decision)` — the dossiê lists `status` as a field on ServiceGroup (`modelo-dados-executavel.md:228`) but does not enumerate the values or define a formal state machine. The five-state enum and its transitions are an implementation design.

```
DRAFT | PUBLISHED | ACCEPTED | CANCELLED | REJECTED
```

### `PriorityMode`

```
STANDARD | PRIORITY_24H
```

- `STANDARD` — no priority window.
- `PRIORITY_24H` — the group must be accepted before a cutoff equal to `scheduled_date - 24 hours`. After the cutoff, publication and acceptance both fail with `PRIORITY_EXPIRED`.

### `ServiceGroupExceptionType`

```
LOW_DENSITY_REGION | ISOLATED_SERVICE | PRIORITY_CLIENT
```

Declaring an exception relaxes the size limit (see `ServiceGroupValidator` in Ports section).

## State Machine

```
       ┌───────┐   publish()   ┌──────────┐   accept() / assign()   ┌──────────┐
       │ DRAFT │──────────────▶│ PUBLISHED│────────────────────────▶│ ACCEPTED │
       └───┬───┘               └────┬─────┘                         └────┬─────┘
           │ cancel / reject         │ cancel / reject                   │ cancel / reject
           ▼                         ▼                                   ▼
     ┌───────────┐            ┌───────────┐                        ┌───────────┐
     │ CANCELLED │            │ CANCELLED │                        │ CANCELLED │
     └───────────┘            │    or     │                        │    or     │
                              │  REJECTED │                        │  REJECTED │
                              └───────────┘                        └───────────┘
```

Notes:

- `assign()` (manual) can move `DRAFT → ACCEPTED` or `PUBLISHED → ACCEPTED` in one step.
- `accept()` (marketplace) only moves `PUBLISHED → ACCEPTED`.
- `reject()` is only valid from `PUBLISHED` or `ACCEPTED`. `cancel()` is valid from `DRAFT`, `PUBLISHED`, or `ACCEPTED`.
- Terminal states are `CANCELLED` and `REJECTED`. Once a group is terminal, no further transitions occur.

## Entities

### `service_groups`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `tenant_id` | uuid | no | — | FK → `tenants.id`. |
| `service_type_id` | uuid | no | — | FK → `service_types.id`. |
| `status` | `ServiceGroupStatus` | no | `DRAFT` | |
| `group_size` | int | no | — | Count of linked appointments at creation time. Immutable. |
| `offered_count` | int | no | `0` | Field exists in dossiê data model. Incremented on publish (`implementation decision`). Supports a possible future re-publish flow (GAP-004) that is not yet an approved rule. |
| `confirmed_count` | int | no | `0` | Number of appointments successfully scheduled after acceptance. |
| `scheduled_date` | date | no | — | Service date. |
| `time_window` | varchar(11) | no | — | Format `HH:mm-HH:mm`. |
| `name` | varchar(255) | yes | — | Optional display name for operators. |
| `region_name` | varchar(255) | yes | — | Denormalized from `service_regions.name` at creation. |
| `description` | text | yes | — | Max 5000 chars at schema level. |
| `priority_mode` | `PriorityMode` | no | `STANDARD` | |
| `priority_expires_at` | timestamptz | yes | — | Set when `priority_mode = PRIORITY_24H`. |
| `exception_type` | `ServiceGroupExceptionType` | yes | — | Optional. Requires `exception_reason` when set. |
| `exception_reason` | text | yes | — | Required when `exception_type` is set. |
| `assigned_inspector_id` | uuid | yes | — | FK → `inspectors.id`. Set on `ACCEPTED`. |
| `service_region_id` | uuid | yes | — | FK → `service_regions.id`, `ON DELETE RESTRICT`. Required for publication. |
| `published_at` | timestamptz | yes | — | Set on transition to `PUBLISHED`. |
| `assigned_at` | timestamptz | yes | — | Set on transition to `ACCEPTED`. |
| `created_by_user_id` | uuid | no | — | FK → `users.id`. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes** (declared in Prisma)

- Standard multi-column indexes on tenant/status/date to support operator list views. See `apps/backend/prisma/schema.prisma` for the authoritative list.

**Invariants**

- `priority_mode = PRIORITY_24H` ⇒ `priority_expires_at IS NOT NULL`.
- `status = ACCEPTED` ⇒ `assigned_inspector_id IS NOT NULL AND assigned_at IS NOT NULL`.
- `status = PUBLISHED` ⇒ `published_at IS NOT NULL AND service_region_id IS NOT NULL`.
- `exception_type IS NOT NULL` ⇔ `exception_reason IS NOT NULL`.
- `group_size` equals the count of linked appointments at creation. It is not updated if appointments are detached on cancellation — consumers must prefer `confirmed_count` when reading "how many made it through".

### Related entities (owned elsewhere)

- **Appointment** (feature 006) — holds `service_group_id` FK. This feature writes to it through `IAppointmentRepository.update` when transitioning `DRAFT → AWAITING_INSPECTOR` on create and `AWAITING_INSPECTOR → SCHEDULED` on accept/assign.
- **Inspector** (inspector module) — holds `serviceTypesJson`, `clientEligibilityJson`. Read by marketplace filters and by manual-assign eligibility checks.
- **InspectorRegion** (inspector module) — many-to-many mapping used to decide whether an inspector's regions cover the properties of a group.
- **ServiceRegion** (feature 004) — polygon used by publish, manual assign, and marketplace filtering.
- **Pricing rules** (feature 004) — consumed by the marketplace offer-listing use case to compute `payoutEstimate`.

## Domain Logic

### `ServiceGroupEntity` state predicates

- `canPublish()` → `status === 'DRAFT'`
- `canAssign()` → `status ∈ {'DRAFT', 'PUBLISHED'}`
- `canAccept()` → `status === 'PUBLISHED'`
- `canCancel()` → `status ∈ {'DRAFT', 'PUBLISHED', 'ACCEPTED'}`
- `canReject()` → `status ∈ {'PUBLISHED', 'ACCEPTED'}`
- `isPriorityExpired(now)` → `priority_mode === 'PRIORITY_24H' && priority_expires_at <= now`

### `ServiceGroupValidator.validate(appointments, serviceTypeId, tenantId, exceptionType?)`

Runs at creation. Throws if any of the following hold:

- `appointments.length < min || > max` (min/max depend on `exceptionType`, see below).
- Any appointment has `tenantId !== expectedTenantId` (caller pre-checks; validator assumes uniform tenant).
- Any appointment has `status ∉ {DRAFT, AWAITING_INSPECTOR}`.
- Any appointment has `serviceGroupId !== null`.
- Any appointment has `serviceTypeId !== expectedServiceTypeId`.

### Size limits

| Exception type | Min | Max |
|---|---|---|
| `(none — standard)` | 5 | 25 |
| `LOW_DENSITY_REGION` | 1 | 25 |
| `ISOLATED_SERVICE` | 1 | 3 |
| `PRIORITY_CLIENT` | 1 | 8 |

The shared Zod schema enforces the hard boundary of 1..25; the domain validator applies the effective limit per exception. See `projeto-consolidado/service-group-exceptions.md` for rationale.

## Ports (domain interfaces)

### `IServiceGroupRepository`

- `save(group): void`
- `findById(groupId, tenantId: string | null): { group, appointments } | null` — passes `null` for cross-tenant reads (AM/OP and INSP marketplace).
- `findAll(filters, pagination): ServiceGroupEntity[]`
- `count(filters): number`
- `update(groupId, partial): void`
- `linkAppointments(appointmentIds, groupId): void` — sets `appointments.service_group_id`.
- `scheduleAppointments(groupId, inspectorId): number` — transitions linked appointments to `SCHEDULED` and sets `assigned_inspector_id`; returns the count updated.
- `acceptOptimistic(groupId, inspectorId, now): number` — conditional UPDATE: `WHERE status='PUBLISHED' AND assigned_inspector_id IS NULL`. Returns updated row count (0 = lost race).
- `findPublishedForInspector(inspectorId, serviceTypesJson, clientEligibilityJson, pagination): MarketplaceOfferRow[]` — filters and enriches with tenant name, service type name, suburbs, addresses, payout estimate, key requirement.
- `countPublishedForInspector(inspectorId, serviceTypesJson, clientEligibilityJson): number`

### Cross-module ports consumed

- `IAppointmentRepository` (feature 006) — `findById`, `update` (state transitions).
- `IInspectorRepository` (inspector module) — `findById`; entity exposes `isActive`, `supportsServiceType`, `isEligibleForTenant`.
- `IServiceRegionRepository` (feature 004) — `findById`, `findPropertyIdsInInspectorRegions`.

## Audit Linkage

Actions emitted via `AuditService`:

- `service_group.created`
- `service_group.updated`
- `service_group.published`
- `service_group.accepted` — via marketplace
- `service_group.manually_assigned` — includes `reason = "Manual assignment by <role>"`
- `service_group.cancelled` — includes caller reason
- `service_group.rejected` — includes caller reason

Each entry carries `tenantId`, `entityId = groupId`, and `before`/`after` snapshots.

## Side Effects Summary

| Use case | Appointment writes | Service group writes | Idempotency | Audit action |
|---|---|---|---|---|
| Create | DRAFT→AWAITING_INSPECTOR on members; link `service_group_id` | Insert as DRAFT | — | `service_group.created` |
| Update | — | Patch name/region/description | — | `service_group.updated` |
| Publish | — | `status=PUBLISHED`, `published_at`, `offered_count++` | Idempotent (re-publish returns state) | `service_group.published` |
| Manual assign | AWAITING_INSPECTOR→SCHEDULED, set `assigned_inspector_id` | `status=ACCEPTED`, `assigned_inspector_id`, `assigned_at`, `confirmed_count` | In-line same-inspector short-circuit | `service_group.manually_assigned` |
| Accept (marketplace) | AWAITING_INSPECTOR→SCHEDULED, set `assigned_inspector_id` | Optimistic UPDATE to `ACCEPTED` | `IIdempotencyService` scope `accept-offer`, 24 h | `service_group.accepted` |
| Cancel | Unlink `service_group_id` from appointments | `status=CANCELLED` | — | `service_group.cancelled` (reason) |
| Reject | — | `status=REJECTED` | — | `service_group.rejected` (reason) |

## Migration History

Phase 1 schema applied in `apps/backend/prisma/migrations/`. Phase 2 items that change the state machine or add new columns (e.g., a possible `EXPIRED` status under GAP-003) require expand/contract migrations coordinated with feature 006.
