# Data Model: Inspectors & Execution

**Feature**: `008-inspectors-execution`
**Status**: IMPLEMENTED
**Source**: `apps/backend/prisma/schema.prisma` (`Inspector`, `InspectorAvailabilitySlot`, `InspectionExecution`, `InspectionAsset`, plus enums), `apps/backend/src/modules/{inspector,inspector-execution}/domain/**`

All timestamps are `timestamptz`. Decimal coordinates use `Decimal(10,7)` (~1 cm precision). Column names follow `snake_case`; Prisma exposes them as `camelCase`.

## Enums

### `InspectorStatus`

```
ACTIVE | INACTIVE
```

### `AvailabilitySlotStatus`

```
AVAILABLE | BOOKED | CANCELLED
```

> Booking is not automated in Phase 1 — slots stay `AVAILABLE` even when an appointment is assigned. Tracked as GAP-003.

### `InspectionAssetKind`

```
PHOTO | DOCUMENT | SIGNATURE
```

### `InspectionAssetStatus`

```
PENDING | UPLOADED | FAILED
```

- `PENDING` — row created when presigned URL is issued; no object in storage yet.
- `UPLOADED` — confirmed by `ConfirmAssetUploadUseCase` after the object lands in storage.
- `FAILED` — set by the expire worker when the TTL elapses without confirmation.

## Entities

### `inspectors`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `user_id` | uuid | yes | — | **UNIQUE**. FK → `users.id`. Enables PWA login. |
| `name` | varchar(200) | no | — | |
| `email` | varchar(254) | no | — | **UNIQUE** globally. |
| `phone` | varchar(20) | yes | — | |
| `status` | `InspectorStatus` | no | `ACTIVE` | |
| `payment_settings_json` | jsonb | no | `{}` | Payout method, bank details, tax info. Shape opaque (GAP-009). |
| `regions_json` | jsonb | no | `[]` | **Legacy/transitional** (`implementation decision`). The canonical source for region coverage is `inspector_regions` → `ServiceRegion` (tenant-scoped). This field should be treated as a denormalized cache or removed (GAP-002). |
| `service_types_json` | jsonb | no | `[]` | Array of `service_type_id` UUIDs the inspector supports. Drives marketplace filtering (`IMPLEMENTED`). |
| `client_eligibility_json` | jsonb | no | `[]` | Array of `tenant_id` UUIDs the inspector is allowed to work for (`IMPLEMENTED`). Drives marketplace cross-tenant filtering. |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | | | Soft delete supported. |

**Indexes**

- `UNIQUE (user_id)`
- `UNIQUE (email)`
- `(status)`
- `(deleted_at)`

**Invariants**

- `email` is globally unique across all inspectors (including inactive and deleted).
- `user_id` is nullable but unique when set — at most one inspector per user.
- `status = INACTIVE` ⇒ inspector cannot be assigned to new appointments. Existing assignments are preserved.
- Deactivation is blocked by `IInspectorAppointmentChecker` when the inspector has open appointments.
- `service_types_json` and `client_eligibility_json` are consumed by `GetMarketplaceOffersUseCase` (feature 005); they must stay in sync with the operator's intended eligibility.

### `inspector_availability_slots`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `inspector_id` | uuid | no | — | FK → `inspectors.id`. |
| `date` | date | no | — | |
| `start_time` | varchar(5) | no | — | `HH:mm`. |
| `end_time` | varchar(5) | no | — | `HH:mm`. |
| `region_json` | jsonb | yes | — | **Transitional region hint** (`implementation decision` — stores a name or id as a freeform object). The canonical direction is to align slot regions with tenant-scoped `ServiceRegion` rows once GAP-002 lands. |
| `capacity` | int | no | `1` | Number of appointments this slot can hold. Not decremented in Phase 1 (GAP-003). |
| `status` | `AvailabilitySlotStatus` | no | `AVAILABLE` | |
| `created_at`, `updated_at` | timestamptz | no | | |

**Indexes**

- `(inspector_id)`
- `(inspector_id, date)`
- `(inspector_id, status)`

### `inspection_executions`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `appointment_id` | uuid | no | — | **UNIQUE** → `appointments.id`. One execution per appointment. |
| `inspector_id` | uuid | no | — | FK → `inspectors.id`. |
| `started_at` | timestamptz | no | — | Set on `StartInspectionUseCase`. |
| `finished_at` | timestamptz | yes | — | Set on `FinishInspectionUseCase`. |
| `start_latitude` | decimal(10,7) | no | — | |
| `start_longitude` | decimal(10,7) | no | — | |
| `finish_latitude` | decimal(10,7) | yes | — | |
| `finish_longitude` | decimal(10,7) | yes | — | |
| `checklist_json` | jsonb | yes | — | Opaque structure; shape per service type. |
| `notes` | text | yes | — | |
| `created_at`, `updated_at` | timestamptz | no | | |

**Indexes**

- `UNIQUE (appointment_id)` — one execution per appointment.
- `(inspector_id)`
- `(started_at)`

**Invariants**

- `finished_at IS NULL` ⇒ `finish_latitude` and `finish_longitude` are null and `checklist_json` may be null.
- `finished_at IS NOT NULL` ⇒ `finish_latitude`, `finish_longitude` must be set.
- Start coordinates are required at creation time; finish coordinates are required at finish time.
- Re-opening a finished execution is not supported (GAP-007).

### `inspection_assets`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `appointment_id` | uuid | no | — | FK → `appointments.id`. |
| `inspection_execution_id` | uuid | no | — | FK → `inspection_executions.id`. |
| `storage_key` | text | no | — | **UNIQUE**. `inspections/<tenantId>/<appointmentId>/<assetId>.<ext>`. |
| `mime_type` | text | no | — | Validated against whitelist per `kind`. |
| `size_bytes` | int | yes | — | Populated on confirm if the storage adapter reports it. |
| `kind` | `InspectionAssetKind` | no | — | |
| `status` | `InspectionAssetStatus` | no | `PENDING` | |
| `uploaded_by` | uuid | no | — | FK → `users.id` (the inspector's user). |
| `upload_expires_at` | timestamptz | yes | — | 15 minutes after the presigned URL is issued. |
| `created_at` | timestamptz | no | `now()` | |

**Indexes**

- `UNIQUE (storage_key)`
- `(appointment_id)`
- `(inspection_execution_id)`
- `(status)`
- `(uploaded_by)`

**Invariants**

- `status = UPLOADED` ⇒ `storage_key` resolves to an existing object in the storage bucket at confirm time.
- `status = PENDING` and `upload_expires_at < now()` ⇒ eligible for the `expire-assets.worker.ts` sweep.
- Assets are owned by their execution via `inspection_execution_id`; cross-execution asset references are forbidden.

## Domain Services

### `T1VisibilityService`

Pure domain helper. Signature: `isVisibleForInspector(flowType, tenantConfirmationStatus, keyRequired, scheduledDate, today) → boolean`.

Rules:

- `INGOING` or `OUTGOING` → **visible**.
- `keyRequired = true` → **visible**.
- `tenantConfirmationStatus = CONFIRMED` → **visible**.
- `tenantConfirmationStatus = UNAVAILABLE` → **hidden**.
- Otherwise (ROUTINE + PENDING + no key): **hidden** on day-of and day-before (T-0, T-1), **visible** from T-2 onward.

### `InspectionTimeWindowService`

Pure domain helper. Computes whether the current time is within an allowed window around the appointment's `scheduled_date` + `time_slot`. Exact bounds are hardcoded in Phase 1 (GAP-005).

### `allowed-mime-types.ts`

Static matrix mapping `InspectionAssetKind` → allowed `mimeType` values.

| Kind | Allowed MIME types (indicative) |
|---|---|
| `PHOTO` | `image/jpeg`, `image/png`, `image/heic`, `image/webp` |
| `SIGNATURE` | `image/svg+xml`, `image/png` |
| `DOCUMENT` | `application/pdf`, `image/jpeg`, `image/png` |

`isAllowedMimeType(kind, mimeType)` returns true when the pair is in the matrix.

## Ports (domain interfaces)

### `IInspectorRepository`

- `findById(id)` — includes `userId`, `serviceTypesJson`, `clientEligibilityJson` used by `AcceptOfferUseCase` (feature 005).
- `findAll(filters, pagination)` / `count(filters)`.
- `save` / `update`.

### `IAvailabilitySlotRepository`

- CRUD + `findByIdAny(id)` for the flat PATCH route.

### `IInspectorAppointmentChecker`

- `hasOpenAppointments(inspectorId): boolean` — used by `DeactivateInspectorUseCase`.

### `IInspectionExecutionRepository`

- `findByAppointmentId(appointmentId)` — single execution.
- `save(execution)` / `update(id, partial)`.

### `IInspectionAssetRepository`

- `save(asset)` / `findById(id)` / `findUploadedByExecutionId(id)` — used at finish to count photos and signatures.

### `IStorageService`

- `createSignedUploadUrl(bucket, key, ttlSeconds): { url }` — returns a presigned URL.
- `objectExists(bucket, key): boolean` — used by `ConfirmAssetUploadUseCase`.
- Implementations: `SupabaseStorageService` (prod), `StubStorageService` (tests).

### `IServiceTypeReader`

- `findById(serviceTypeId): { flowType, checklistTemplate } | null` — cross-module adapter port that reads from feature 004 without importing its Prisma models.

### `IIdempotencyService`

- `get(key, scope)` / `set(key, scope, value, ttlHours)` — shared helper consumed by start/finish.

## Relationships

```
users (1) ─── inspectors (0..1)                    [link for PWA login]
inspectors (1) ─── inspector_availability_slots (0..*)
inspectors (1) ─── inspector_regions (0..*)        [many-to-many with service_regions, owned by feature 004]
inspectors (1) ─── appointments (0..*)             [assigned_inspector, feature 006]
appointments (1) ─── inspection_executions (0..1)
inspection_executions (1) ─── inspection_assets (0..*)
```

- `inspections_executions.appointment_id → appointments.id` is unique (one execution per appointment).
- `inspection_assets.inspection_execution_id → inspection_executions.id` is required.
- `inspection_assets.appointment_id → appointments.id` duplicates the link for direct queries.

## Audit Linkage

Actions emitted via `AuditService`:

- `inspector.created`, `inspector.updated`, `inspector.linked_to_user`, `inspector.deactivated`
- `availability_slot.created`, `availability_slot.updated`, `availability_slot.cancelled`
- `inspection_execution.started`, `inspection_execution.finished`
- Appointment timeline mirrors: `inspection.started`, `inspection.finished`

The execution flow also triggers `appointment.status_transition` (from feature 006's `ExecuteStatusTransitionUseCase`) and `appointment.done_pending_crosscheck` (when INSP marks DONE without cross-check — fires because finish calls the transition without supplying `doneCheckedByUserId`).

## Side Effects Summary

| Use case | Writes | Audit | Notification |
|---|---|---|---|
| Create inspector | Insert row | `inspector.created` | — |
| Update inspector | Partial update | `inspector.updated` | — |
| Link to user | Set `user_id` | `inspector.linked_to_user` | — |
| Deactivate inspector | `status = INACTIVE` | `inspector.deactivated` (with reason) | — |
| Create/update/cancel slot | Slot CRUD | `availability_slot.*` | — |
| Get schedule (PWA) | — | — | — |
| Start inspection | Insert execution, idempotency cache | `inspection_execution.started` + `inspection.started` | — |
| Request asset upload | Insert PENDING asset, issue presigned URL | — | — |
| Confirm asset upload | Flip to `UPLOADED` | — | — |
| Finish inspection | Update execution, call `ExecuteStatusTransitionUseCase` (DONE) | `inspection_execution.finished` + `inspection.finished` + whatever feature 006 audits (status_transition + done_pending_crosscheck) | `onTransitionHandler` via feature 006 |

## Migration History

Phase 1 schema applied in `apps/backend/prisma/migrations/`. Phase 2 changes (notably GAP-002 consolidation of region data, GAP-003 slot booking integration, GAP-006 pause/resume state) require expand/contract migrations coordinated with features 004, 005, and 006.
