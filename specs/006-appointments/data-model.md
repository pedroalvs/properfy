# Data Model: Appointments

**Feature**: `006-appointments`
**Status**: IMPLEMENTED
**Source**: `apps/backend/prisma/schema.prisma` (`Appointment`, `AppointmentContact`, `AppointmentRestriction`, `AppointmentImport`, `AppointmentStatus`, `TenantConfirmationStatus`, `RestrictionSource`), `apps/backend/src/modules/appointment/domain/**`

All timestamps are `timestamptz`. All IDs are UUID v4 except `appointment_number` (autoincrement int). Column names follow `snake_case`; the Prisma client exposes them as `camelCase`.

## Enums

### `AppointmentStatus`

```
DRAFT | AWAITING_INSPECTOR | SCHEDULED | DONE | CANCELLED | REJECTED
```

`AWAITING_INSPECTOR` is also exposed as the alias `OPEN` in some legacy documentation. The DB and code use `AWAITING_INSPECTOR` exclusively.

### `TenantConfirmationStatus`

```
PENDING | CONFIRMED | UNAVAILABLE | NO_RESPONSE
```

Default on create: `PENDING`. Driven by tenant portal (feature 007) or force-confirmation use case (this feature).

### `RestrictionSource`

```
TENANT | AGENCY | INSPECTOR
```

Identifies which party reported the restriction.

## State Machine

The authoritative transition matrix lives in `apps/backend/src/modules/appointment/domain/appointment-state-machine.ts`. **Every transition MUST go through `ExecuteStatusTransitionUseCase`** (constitution Principle VI). Direct DB writes to `appointments.status` are forbidden outside migrations.

| # | From | To | Allowed Actors | Reason | DoneCheck |
|---|---|---|---|---|---|
| 1 | `DRAFT` | `AWAITING_INSPECTOR` | OP, SYS | no | no |
| 2 | `DRAFT` | `REJECTED` | AM, OP | **yes** | no |
| 3 | `DRAFT` | `CANCELLED` | AM, OP, CL_ADMIN, CL_USER | **yes** | no |
| 4 | `AWAITING_INSPECTOR` | `SCHEDULED` | SYS, OP | no | no |
| 5 | `AWAITING_INSPECTOR` | `CANCELLED` | AM, OP, CL_ADMIN, CL_USER | **yes** | no |
| 6 | `AWAITING_INSPECTOR` | `REJECTED` | AM, OP | **yes** | no |
| 7 | `SCHEDULED` | `DONE` | INSP, OP | no | **yes** |
| 8 | `SCHEDULED` | `CANCELLED` | AM, OP, CL_ADMIN, CL_USER | **yes** | no |
| 9 | `SCHEDULED` | `REJECTED` | OP, SYS | **yes** | no |
| 10 | `REJECTED` | `DRAFT` | AM, OP | **yes** | no |
| 11 | `REJECTED` | `AWAITING_INSPECTOR` | AM, OP | **yes** | no |
| 12 | `CANCELLED` | `DRAFT` | AM, OP | **yes** | no |
| 13 | `DONE` | `DRAFT` | AM | **yes** | no |
| 14 | `DONE` | `REJECTED` | AM | **yes** | no |

**Additional preconditions** enforced by `ExecuteStatusTransitionUseCase` beyond the matrix:

- **`DRAFT → AWAITING_INSPECTOR`**: requires `service_group_id` set (prevents bypassing the marketplace flow).
- **`AWAITING_INSPECTOR → SCHEDULED`**: if the service type is `ROUTINE` with `requiresTenantConfirmation = true`, requires `tenantConfirmationStatus = CONFIRMED`. `INGOING` and `OUTGOING` skip this check.
- **`* → SCHEDULED`**: requires an inspector (either pre-existing on the appointment or supplied in the payload).
- **`SCHEDULED → DONE`**: the `requiresDoneCheckedBy` flag is `true`, but the actual cross-check is deferred to `PerformCrossCheckUseCase` for the two-person rule. When an `INSP` marks DONE without cross-check, the transition succeeds and an `appointment.done_pending_crosscheck` audit record is written.
- **`CL_USER` cancellations/rejections**: gated by tenant-level permissions (`cancel_appointments`, `reject_appointments`) via `assertClUserPermission`.
- **`INSP` scope**: can only transition appointments where `inspector_id = actor.inspectorId`.

## Entities

### `appointments`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `appointment_number` | int | no | autoincrement | **Globally unique** across tenants. Used as human-readable ref. |
| `tenant_id` | uuid | no | — | FK → `tenants.id`. |
| `branch_id` | uuid | no | — | FK → `branches.id`. Must be active. |
| `property_id` | uuid | no | — | FK → `properties.id`. Must belong to same tenant. |
| `service_type_id` | uuid | no | — | FK → `service_types.id`. Must be active. |
| `inspector_id` | uuid | yes | — | FK → `inspectors.id`. Set on `SCHEDULED`. |
| `service_group_id` | uuid | yes | — | FK → `service_groups.id`. Set when linked to a group (feature 005). |
| `status` | `AppointmentStatus` | no | `DRAFT` | |
| `scheduled_date` | date | no | — | |
| `time_slot` | varchar(50) | no | — | Format `HH:mm-HH:mm`; validated against effective catalog. |
| `key_required` | boolean | no | `false` | |
| `meeting_location` | varchar(500) | yes | — | |
| `key_location` | varchar(500) | yes | — | |
| `tenant_confirmation_status` | `TenantConfirmationStatus` | no | `PENDING` | |
| `price_amount` | decimal(12,2) | no | — | Charged to tenant. Snapshot from pricing rule. |
| `payout_amount` | decimal(12,2) | no | — | Paid to inspector. Computed from rule at create time. |
| `pricing_rule_snapshot_json` | jsonb | no | — | Immutable snapshot of the resolved `ServicePriceRule` at creation. |
| `notes` | text | yes | — | |
| `custom_fields_json` | jsonb | yes | — | Opaque. |
| `reason` | text | yes | — | Set on transitions that require it. Cleared on reopen. |
| `cancellation_reason_code` | varchar(50) | yes | — | Free-form string in Phase 1 (GAP-001). |
| `rejection_reason_code` | varchar(50) | yes | — | Free-form string in Phase 1 (GAP-001). |
| `created_by_user_id` | uuid | no | — | FK → `users.id`. |
| `done_checked_by_user_id` | uuid | yes | — | FK → `users.id`. Set on cross-check. |
| `done_checked_at` | timestamptz | yes | — | Set on cross-check. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | — | Reserved for future soft delete (GAP-005). |

**Indexes**

- `UNIQUE (appointment_number)` — global sequence.
- `(tenant_id, status)`
- `(tenant_id, branch_id)`
- `(tenant_id, inspector_id)`
- `(tenant_id, scheduled_date)`
- `(tenant_id, service_type_id)`
- `(service_group_id)`
- `(deleted_at)`

**Invariants**

- `status = SCHEDULED` ⇒ `inspector_id IS NOT NULL`.
- `status = DONE` with financial entries created ⇒ `done_checked_by_user_id IS NOT NULL AND done_checked_at IS NOT NULL`. The appointment may transiently be in `DONE` without cross-check — financial entries are withheld in that window.
- `service_group_id IS NOT NULL` whenever `status ∈ {AWAITING_INSPECTOR, SCHEDULED, DONE}` (set by feature 005, unset on service group cancellation).
- `price_amount`, `payout_amount`, and `pricing_rule_snapshot_json` are set at creation and never updated afterward.
- `scheduled_date < now()` at creation is rejected for non-AM/OP actors.
- `cancellation_reason_code` set only on `status = CANCELLED`; `rejection_reason_code` only on `status = REJECTED`.

### `appointment_contacts`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `appointment_id` | uuid | no | — | **UNIQUE** → `appointments.id`, `ON DELETE CASCADE`. |
| `tenant_name` | varchar(200) | no | — | Renter's display name. |
| `primary_email` | varchar(254) | yes | — | |
| `secondary_email` | varchar(254) | yes | — | |
| `primary_phone` | varchar(30) | yes | — | |
| `secondary_phone` | varchar(30) | yes | — | |
| `created_at`, `updated_at` | timestamptz | no | | |

**Invariants**

- One-to-one with appointment.
- At least one contact field (email or phone) should be present in practice; not enforced at the DB level.

### `appointment_restrictions`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `appointment_id` | uuid | no | — | FK → `appointments.id`, `ON DELETE CASCADE`. |
| `is_home` | boolean | no | — | Whether the renter is normally home during the window. |
| `unavailable_days_json` | jsonb | yes | — | Array of strings (e.g., `"MON"`, `"WED"`). |
| `unavailable_hours_json` | jsonb | yes | — | Array of hour ranges. |
| `notes` | text | yes | — | |
| `source` | `RestrictionSource` | no | — | `TENANT`, `AGENCY`, or `INSPECTOR`. |
| `created_at`, `updated_at` | timestamptz | no | | |

### `appointment_imports`

Same shape as `property_imports` (feature 003). Tracks bulk import jobs.

| Column | Type | Notes |
|---|---|---|
| `id`, `tenant_id`, `status`, `file_key`, `original_filename`, `total_rows`, `success_count`, `error_count`, `errors_json`, `created_by_user_id`, `created_at`, `updated_at` | (as in 003-properties data model) | Phase 1 uses a plain varchar for `status` — `PENDING`, `PROCESSING`, `DONE`, `FAILED`. |

## Domain Logic

### `AppointmentStateMachine`

- `getTransitionRule(from, to)` → `TransitionRule | null` (lookup in `TRANSITION_RULES`).
- `validateTransition(currentStatus, targetStatus, actorRole)` → `{ valid, rule, error? }`.
- The state machine does NOT enforce the extra preconditions (service group link, tenant confirmation, inspector requirement) — those live in `ExecuteStatusTransitionUseCase` because they require cross-module reads.

### Pricing snapshot helpers (`appointment-pricing.service.ts`)

Pure functions, no I/O, unit-testable without mocks:

- `snapshotPricing(pricingRule)` → a frozen object suitable for `pricing_rule_snapshot_json`.
- `calculatePayoutAmount(priceAmount, payoutType, payoutValue)` → numeric result respecting `FIXED` vs `PERCENTAGE` semantics.

## Ports (domain interfaces)

### `IAppointmentRepository`

- `findById(appointmentId, tenantId: string | null)` → `{ appointment, contact, restriction, property, branch, serviceType }` or `null`. `null` tenantId is an AM/OP escape for cross-tenant lookups.
- `findByPropertyId(propertyId)` → list (used by property deletion check).
- `findAll(filters, pagination)` → paginated appointments with enrichment.
- `count(filters)` → number.
- `save(appointment)` → void (insert).
- `update(appointmentId, tenantId, partial)` → void.
- `saveContact(contact)`, `saveRestriction(restriction)`.
- `findContactById(contactId)` → used by the contacts drawer.

### `IAppointmentImportRepository`

- Standard CRUD for `AppointmentImport` rows.

### Cross-module ports consumed

All from ports owned by other features; never direct Prisma imports.

## Audit Linkage

Actions emitted via `AuditService`:

- `appointment.created`
- `appointment.updated`
- `appointment.status_transition` — on every transition
- `appointment.done_pending_crosscheck` — auxiliary record when an INSP marks DONE without cross-check
- `appointment.done_checked` — written by `PerformCrossCheckUseCase`
- `appointment.done_rejected` — auxiliary record on DONE → REJECTED flagging financial review
- `appointment.force_manual_confirmation`
- `appointment.imported` (per row) — written by the import worker

Every entry carries `tenantId`, `entityId`, `before`/`after` snapshots, and `reason` where applicable.

## Side Effects Summary

| Use case | Appointment writes | Side effects |
|---|---|---|
| Create | Insert appointment + contact + optional restriction | Inline property creation (feature 003); audit |
| Update | Partial update (limited fields, DRAFT/AWAITING_INSPECTOR only) | Audit |
| Status transition | `status`, `reason`, `inspector_id`, `done_checked_*`, typed reason codes | `onDoneHandler` (billing) IF DONE + cross-check; `onTransitionHandler` (notifications) always; idempotency cache write |
| Cross-check | `done_checked_by_user_id`, `done_checked_at` | `onDoneHandler` (billing); audit |
| Force confirmation | `tenant_confirmation_status` | Audit |
| Import | Inserts via worker | File upload; idempotency cache; audit per row; batch-level audit is GAP candidate |

## Migration History

Phase 1 schema applied in `apps/backend/prisma/migrations/`. Phase 2 changes to the state machine (e.g., GAP-009's `done_marked_by_user_id` column) require expand/contract migrations coordinated with feature 011.
