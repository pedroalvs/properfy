# Time Slot Endpoints

**Feature**: `012-appointment-time-slot`
**Status**: IMPLEMENTED (CRUD + effective resolution); overlap detection APPROVED NOT YET IMPLEMENTED
**Source**: `apps/backend/src/modules/appointment-time-slot/interfaces/appointment-time-slot.routes.ts`, `packages/shared/src/schemas/appointment-time-slot.ts`

---

## POST `/v1/time-slots`

Create a new time slot for a tenant (optionally scoped to a branch).

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP` (own tenant only); `CL_ADMIN` (own tenant only, `implementation decision`)
- **Audit**: yes (`appointment_time_slot.created`)

**Request body** (`createAppointmentTimeSlotSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `tenantId` | uuid | conditional | Required for AM. Ignored for OP/CL_ADMIN (derived from JWT). |
| `branchId` | uuid | no | Null = tenant-wide default. Must belong to the tenant if provided. |
| `label` | string (1..100) | yes | Human-readable display name. |
| `startTime` | string (`HH:mm`) | yes | Must be before `endTime`. |
| `endTime` | string (`HH:mm`) | yes | Must be after `startTime`. |
| `sortOrder` | int | yes | Display order (lower first). |

**Response 201**

```json
{
  "data": {
    "id": "<uuid>",
    "tenantId": "<uuid>",
    "branchId": "<uuid|null>",
    "label": "Morning",
    "startTime": "09:00",
    "endTime": "12:00",
    "sortOrder": 1,
    "isActive": true,
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `BRANCH_NOT_FOUND`, `TIME_SLOT_CONFLICT` (duplicate exact match), `TIME_SLOT_OVERLAP` (overlapping range — `APPROVED NOT YET IMPLEMENTED`), `VALIDATION_ERROR`.

---

## GET `/v1/time-slots`

Admin list of all time slots for a tenant (includes inactive when requested). Not branch-resolved — shows all scopes.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP` (own tenant); `CL_ADMIN` (own tenant). `CL_USER` and `INSP` are forbidden.

**Query params** (`listAppointmentTimeSlotsQuerySchema`)

| Name | Type | Notes |
|---|---|---|
| `tenantId` | uuid | Required for AM. Ignored for OP/CL_ADMIN. |
| `branchId` | uuid | Optional filter. |
| `includeInactive` | boolean | Default `false`. When `true`, includes `isActive = false` slots. |

**Response 200**: array of time slot objects (same shape as create response).

**Error codes**: `AUTH_FORBIDDEN`, `VALIDATION_ERROR`.

---

## GET `/v1/time-slots/effective`

Resolve the effective time-slot catalog for a specific branch. Returns branch-specific overrides if any exist, otherwise tenant-wide defaults. Results are always active, non-deleted, sorted by `sortOrder`.

- **Auth**: required
- **Allowed roles**: `AM`, `OP` (own tenant), `CL_ADMIN` (own tenant), `CL_USER` (own tenant). `INSP` is forbidden.

**Query params** (`listEffectiveTimeSlotsQuerySchema`)

| Name | Type | Required | Notes |
|---|---|---|---|
| `branchId` | uuid | yes | The branch to resolve effective slots for. |
| `tenantId` | uuid | no | AM only. OP/CL derive from JWT. |

**Response 200**

```json
{
  "data": [
    {
      "id": "<uuid>",
      "label": "Morning",
      "startTime": "09:00",
      "endTime": "12:00",
      "value": "09:00-12:00"
    }
  ]
}
```

> `value` is the `compositeValue` used by feature 006 for appointment validation and stored on `appointments.time_slot`.

**Error codes**: `AUTH_FORBIDDEN`, `BRANCH_NOT_FOUND`, `VALIDATION_ERROR`.

---

## PATCH `/v1/time-slots/:id`

Update a time slot's properties.

- **Auth**: required
- **Allowed roles**: `AM`; `OP` (own tenant); `CL_ADMIN` (own tenant)
- **Audit**: yes (`appointment_time_slot.updated`)

**Request body** (`updateAppointmentTimeSlotSchema`, all fields optional)

| Field | Type | Notes |
|---|---|---|
| `label` | string (1..100) | |
| `startTime` | string (`HH:mm`) | Must keep `startTime < endTime`. |
| `endTime` | string (`HH:mm`) | |
| `sortOrder` | int | |
| `isActive` | boolean | `false` hides from effective catalog without deleting. |

**Response 200**: updated time slot object.

**Error codes**: `AUTH_FORBIDDEN`, `TIME_SLOT_NOT_FOUND`, `TIME_SLOT_OVERLAP` (`APPROVED NOT YET IMPLEMENTED`), `VALIDATION_ERROR`.

---

## DELETE `/v1/time-slots/:id`

Soft-delete a time slot. Sets `deleted_at`; excluded from all future queries.

- **Auth**: required
- **Allowed roles**: `AM`; `OP` (own tenant); `CL_ADMIN` (own tenant)
- **Audit**: yes (`appointment_time_slot.deleted`)

**Response 204** — no body.

**Error codes**: `AUTH_FORBIDDEN`, `TIME_SLOT_NOT_FOUND`.
