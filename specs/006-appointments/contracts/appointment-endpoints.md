# Appointment Endpoints

**Feature**: `006-appointments`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/appointment/interfaces/appointment.routes.ts`, `packages/shared/src/schemas/appointment.ts`

---

## POST `/v1/appointments`

Create a new appointment.

- **Auth**: required
- **Allowed roles**: `AM`, `OP`, `CL_ADMIN`, `CL_USER` (with `create_appointments` permission)
- **Audit**: yes (`appointment.created`)
- **Side effects**: optional inline property creation; pricing rule resolution + snapshot.

**Request body** (`createAppointmentSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `branchId` | uuid | yes | Must belong to the resolved tenant and be `ACTIVE`. |
| `propertyId` | uuid | conditional | Either `propertyId` OR `property` must be provided. |
| `property` | object | conditional | Inline property payload — same shape as `createPropertySchema` minus `tenantId`/`branchId`. |
| `serviceTypeId` | uuid | yes | Must be `ACTIVE`. |
| `scheduledDate` | date (`YYYY-MM-DD`) | yes | |
| `timeSlot` | string (`HH:mm-HH:mm`) | yes | Must be in the effective time-slot catalog for the branch. |
| `contact` | object | yes | `{ tenantName, primaryEmail?, secondaryEmail?, primaryPhone?, secondaryPhone? }` |
| `restriction` | object | no | `{ isHome, unavailableDays?, unavailableHours?, notes?, source }` |
| `keyRequired` | boolean | no | Default `false`. |
| `meetingLocation` | string | no | |
| `keyLocation` | string | no | |
| `notes` | string | no | |
| `customFields` | object | no | Opaque. |

**Response 201**: full appointment payload including contact and optional restriction, pricing snapshot, and numeric `priceAmount` / `payoutAmount`.

**Error codes**: `AUTH_FORBIDDEN`, `APPOINTMENT_BRANCH_NOT_FOUND`, `APPOINTMENT_BRANCH_INACTIVE`, `APPOINTMENT_PROPERTY_NOT_FOUND`, `APPOINTMENT_PROPERTY_TENANT_MISMATCH`, `APPOINTMENT_SERVICE_TYPE_NOT_FOUND`, `APPOINTMENT_SERVICE_TYPE_INACTIVE`, `APPOINTMENT_NO_PRICE_RULE`, `APPOINTMENT_PAST_DATE`, `VALIDATION_ERROR`.

---

## GET `/v1/appointments`

List appointments with filters and pagination.

- **Auth**: required
- **Allowed roles**: all authenticated roles. AM can cross-tenant; OP scoped to own tenant; client roles scoped to own tenant; INSP scoped to own assignments.

**Query params** (`listAppointmentsQuerySchema`)

| Name | Type | Notes |
|---|---|---|
| `page`, `pageSize` | int | Standard pagination. |
| `tenantId` | uuid | AM only (OP is auto-scoped to own tenant). |
| `branchId` | uuid | |
| `status` | `AppointmentStatus` | |
| `serviceTypeId` | uuid | |
| `serviceGroupId` | uuid | |
| `inspectorId` | uuid | |
| `scheduledDateFrom`, `scheduledDateTo` | date | |
| `search` | string | Matches appointment number, property code, or address. |
| `sortBy`, `sortOrder` | | |

**Response 200**: paginated appointment payloads.

---

## GET `/v1/appointments/:appointmentId`

Read a single appointment with all linked entities.

- **Auth**: required
- **Allowed roles**: AM (any tenant); OP (own tenant); CL_ADMIN, CL_USER (own tenant); INSP (own assignment).

**Response 200**: full appointment detail including property summary, contact, restriction, pricing snapshot, service group reference, and audit-friendly fields.

**Error codes**: `APPOINTMENT_NOT_FOUND`. Cross-tenant reads by client roles return `APPOINTMENT_NOT_FOUND` (not `FORBIDDEN`) to prevent existence leakage.

---

## PATCH `/v1/appointments/:appointmentId`

Update mutable fields. Allowed only on `DRAFT` or `AWAITING_INSPECTOR`.

- **Auth**: required
- **Allowed roles**: AM, OP, CL_ADMIN, CL_USER (with appropriate permission).
- **Audit**: yes (`appointment.updated`)

**Request body** (`updateAppointmentSchema`, all fields optional): contact, restriction, `keyRequired`, `meetingLocation`, `keyLocation`, `notes`, `customFields`, `scheduledDate`, `timeSlot`.

> Tenant, branch, property, service type, and pricing snapshot are immutable.

**Response 200**: full appointment payload with updated values.

**Error codes**: `AUTH_FORBIDDEN`, `APPOINTMENT_NOT_FOUND`, `APPOINTMENT_UPDATE_NOT_ALLOWED`, `VALIDATION_ERROR`.

---

## POST `/v1/appointments/:appointmentId/status-transitions`

**The sovereign state transition endpoint.** Executes any valid transition from the matrix.

- **Auth**: required
- **Allowed roles**: per transition matrix — see `data-model.md`.
- **Audit**: yes (`appointment.status_transition`, plus optional side-effect audits)
- **Idempotency**: header `Idempotency-Key`, 24 h retention, scope `status-transition`.
- **Side effects**:
  - `onDoneHandler` fires only when the target is `DONE` AND `doneCheckedByUserId` is provided in the same call (`implementation shortcut` — the canonical business flow is a separate cross-check via `POST /v1/appointments/:id/cross-check-done`; see that endpoint below).
  - `onTransitionHandler` fires on every successful transition (notifications).

**Request body** (`statusTransitionSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `targetStatus` | `AppointmentStatus` | yes | |
| `reason` | string (1..1000) | conditional | Required when the rule sets `requiresReason: true`. |
| `cancellationReasonCode` | string (max 50) | no | Persisted when target is `CANCELLED`. |
| `rejectionReasonCode` | string (max 50) | no | Persisted when target is `REJECTED`. |
| `doneCheckedByUserId` | uuid | conditional | `Implementation shortcut`: provide to perform the cross-check in the same DONE call (must reference an AM/OP distinct from the user behind the inspector). The canonical business flow uses the separate `POST /v1/appointments/:id/cross-check-done` endpoint instead. |
| `inspectorId` | uuid | conditional | Required for `* → SCHEDULED` if the appointment has no inspector yet. |

**Response 200**

```json
{
  "data": {
    "id": "<uuid>",
    "status": "SCHEDULED",
    "previousStatus": "AWAITING_INSPECTOR",
    "reason": "string|null",
    "inspectorId": "<uuid|null>",
    "doneCheckedByUserId": "<uuid|null>",
    "doneCheckedAt": "ISO-8601|null",
    "updatedAt": "ISO-8601"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `APPOINTMENT_NOT_FOUND`, `APPOINTMENT_ACCESS_DENIED`, `APPOINTMENT_INVALID_TRANSITION`, `APPOINTMENT_TRANSITION_NOT_PERMITTED`, `APPOINTMENT_REASON_REQUIRED`, `APPOINTMENT_DONE_CHECK_REQUIRED`, `APPOINTMENT_DONE_CHECKER_INVALID_ROLE`, `APPOINTMENT_DONE_CHECKER_SELF_CHECK`, `APPOINTMENT_INSPECTOR_REQUIRED`, `APPOINTMENT_TENANT_CONFIRMATION_REQUIRED`, `APPOINTMENT_SERVICE_GROUP_REQUIRED`, `VALIDATION_ERROR`.

---

## POST `/v1/appointments/:appointmentId/cross-check-done`

**Two-person rule.** An AM/OP cross-checks an appointment that is already in `DONE`. Populates `doneCheckedByUserId` + `doneCheckedAt` and triggers the billing side effect. Does NOT modify `status`.

- **Auth**: required
- **Allowed roles**: `AM`, `OP` (never the same user who marked DONE)
- **Audit**: yes (`appointment.done_checked`)

**Request body**: empty (`{}`).

**Response 200**: same shape as the status-transition response (`status` stays `DONE`).

**Error codes**: `APPOINTMENT_NOT_FOUND`, `APPOINTMENT_DONE_CROSS_CHECK_NOT_PERMITTED`, `APPOINTMENT_DONE_CROSS_CHECK_INVALID_STATUS`, `APPOINTMENT_DONE_CROSS_CHECK_ALREADY_COMPLETED`, `APPOINTMENT_DONE_CROSS_CHECK_ORIGIN_NOT_FOUND`, `APPOINTMENT_DONE_CROSS_CHECK_SELF_APPROVAL`, `APPOINTMENT_DONE_CROSS_CHECK_EVIDENCE_INCOMPLETE`.

---

## POST `/v1/appointments/:appointmentId/force-confirmation`

Force `tenantConfirmationStatus = CONFIRMED` on behalf of the renter (e.g., confirmation by phone outside the platform).

- **Auth**: required
- **Allowed roles**: `AM`, `OP`, `CL_USER` (with `force_confirmation` permission)
- **Audit**: yes (`appointment.force_manual_confirmation`, carries `reason`)

**Request body** (`forceManualConfirmationSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `tenantConfirmationStatus` | `'CONFIRMED'` | yes | Literal. |
| `reason` | string (min 1) | yes | Audited. |

**Response 200**

```json
{
  "data": {
    "id": "<uuid>",
    "tenantConfirmationStatus": "CONFIRMED"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `APPOINTMENT_NOT_FOUND`, `VALIDATION_ERROR`.

---

## GET `/v1/appointment-contacts`

Paginated view of appointment contacts for operator CRM workflows.

- **Auth**: required
- **Allowed roles**: AM, OP, CL_ADMIN (own tenant), CL_USER (own tenant, scoped further by permissions)

**Query params**

| Name | Type | Notes |
|---|---|---|
| `page`, `pageSize` | int | |
| `tenantId` | uuid | AM only (OP is auto-scoped to own tenant). |
| `confirmationStatus` | string | Filter by `tenantConfirmationStatus`. |
| `search` | string | Matches renter name, email, phone. |
| `sortBy`, `sortOrder` | | |

**Response 200**: paginated contacts with appointment summaries.

---

## GET `/v1/appointment-contacts/:contactId`

Detail view of a single contact.

- **Auth**: required
- **Response 200**: contact detail with linked appointment.

**Error codes**: `AUTH_FORBIDDEN`, `CONTACT_NOT_FOUND`. (Current implementation incorrectly returns `VALIDATION_ERROR` instead of a proper `NOT_FOUND` for missing contacts — `implementation divergence`, should be corrected to return `404 CONTACT_NOT_FOUND` per the standard error convention.)
