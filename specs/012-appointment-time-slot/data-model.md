# Data Model: Appointment Time Slots

**Feature**: `012-appointment-time-slot`
**Status**: IMPLEMENTED (CRUD + effective resolution); overlap detection is APPROVED RULE NOT YET IMPLEMENTED (FR-003b)
**Source**: `apps/backend/prisma/schema.prisma` (`AppointmentTimeSlot`), `apps/backend/src/modules/appointment-time-slot/domain/**`

All timestamps are `timestamptz`. All IDs are UUID v4. Column names follow `snake_case`; Prisma exposes them as `camelCase`.

## Entities

### `appointment_time_slots`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `tenant_id` | uuid | no | — | FK → `tenants.id`. Every slot belongs to exactly one tenant. |
| `branch_id` | uuid | yes | — | FK → `branches.id`. Null = tenant-wide default. Non-null = branch-specific override. |
| `label` | varchar(100) | no | — | Human-readable display name (e.g., "Morning", "Afternoon"). |
| `start_time` | varchar(5) | no | — | `HH:mm` format (24-hour). |
| `end_time` | varchar(5) | no | — | `HH:mm` format (24-hour). Must be > `start_time`. |
| `sort_order` | int | no | `0` | Display ordering. Lower values appear first. |
| `is_active` | boolean | no | `true` | Inactive slots are excluded from the effective catalog but retained for historical reference. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | — | Soft delete. |

**Indexes**

- `UNIQUE (tenant_id, branch_id, start_time, end_time)` — prevents exact duplicates within the same scope. Note: Postgres allows multiple NULLs in unique constraints, so `branch_id = null` is a distinct scope from any specific branch.
- `(tenant_id, branch_id, is_active)` — supports the effective-slot resolution query.
- `(tenant_id, is_active)` — supports the tenant-wide default fallback query.

**Invariants**

- `start_time < end_time` — enforced at the application layer on create and update.
- `tenant_id IS NOT NULL` — every slot is tenant-scoped.
- `branch_id IS NULL` means the slot is a **tenant-wide default**, inherited by all branches that have no overrides.
- `branch_id IS NOT NULL` means the slot is a **branch-specific override**. When a branch has any active, non-deleted override slots, the tenant defaults are hidden for that branch (`implementation decision` — branch-override-or-tenant-default, no merge).
- Overlapping time ranges within the same `(tenant_id, branch_id)` scope MUST be rejected (`APPROVED RULE NOT YET IMPLEMENTED` — FR-003b; code currently only checks exact-match uniqueness via the UNIQUE constraint). Adjacency (end = start of next) is allowed.
- `deleted_at IS NOT NULL` ⇒ slot is invisible to all queries and the effective catalog.
- `is_active = false` ⇒ slot is invisible to the effective catalog but visible in admin list queries with `includeInactive = true`.

## Derived Value

### `compositeValue`

`"<startTime>-<endTime>"` (e.g., `"09:00-12:00"`)

This is the string written to `appointments.time_slot` when an appointment is created. It is a **snapshot** — not a foreign key. Changing or deleting the source slot does not cascade to appointments. The composite value is how feature 006 validates the time-slot selection at creation time: it matches the input against the `compositeValue` of each effective slot.

## Effective-Slot Resolution

The core domain logic (implemented in `IAppointmentTimeSlotRepository.findEffective(tenantId, branchId)`):

1. Query active, non-deleted slots where `tenant_id = :tenantId AND branch_id = :branchId`.
2. If result is non-empty → return it (**branch-specific overrides win**).
3. If result is empty → query active, non-deleted slots where `tenant_id = :tenantId AND branch_id IS NULL` (**tenant-wide defaults as fallback**).
4. Return results sorted by `sort_order ASC`.

This is an **all-or-nothing override**, not a merge. If a branch has even one active slot, the tenant defaults are completely hidden for that branch.

## Relationships

```
tenants (1) [feature 002]
  └── appointment_time_slots (0..*)
         └── branch (optional FK)  [feature 002]

appointments (feature 006)
  └── time_slot (varchar — stores compositeValue as a snapshot string, NOT a FK)
```

- `appointment_time_slots.tenant_id → tenants.id` — required.
- `appointment_time_slots.branch_id → branches.id` — optional.
- No FK from `appointments.time_slot` to this table — the relationship is by value, not by reference.

## Ports (domain interfaces)

### `IAppointmentTimeSlotRepository`

- `create(entity): void` — insert.
- `update(entity): void` — full entity update.
- `findById(id): AppointmentTimeSlotEntity | null`
- `findAll(filters: { tenantId, branchId?, includeInactive? }): AppointmentTimeSlotEntity[]` — admin list with optional filters.
- `findEffective(tenantId, branchId): AppointmentTimeSlotEntity[]` — the effective-slot resolution (branch-override-or-tenant-default pattern). Returns only active, non-deleted slots sorted by `sort_order`.
- `softDelete(id): void` — sets `deleted_at`.

## Audit Linkage

Actions emitted via `AuditService`:

- `appointment_time_slot.created` — with `after` snapshot.
- `appointment_time_slot.updated` — with `before`/`after` snapshot.
- `appointment_time_slot.deleted` — with `before` snapshot.

## Default Seeding

When feature 002 creates a new tenant, `CreateTenantUseCase` seeds 2 default slots via this feature's `IAppointmentTimeSlotRepository.create()`:

| Label | start_time | end_time | sort_order | branch_id |
|---|---|---|---|---|
| (Morning) | `09:00` | `12:00` | 1 | `null` (tenant default) |
| (Afternoon) | `14:00` | `17:00` | 2 | `null` (tenant default) |

These are `implementation decision` defaults — the dossiê does not specify the default seeding values.
