# Tenant Portal Endpoints

**Feature**: `007-tenant-portal`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/tenant-portal/interfaces/tenant-portal.routes.ts`, `packages/shared/src/schemas/tenant-portal.ts`

---

## POST `/v1/appointments/:appointmentId/portal-token`

Generate a new portal token for an appointment. Operator-only. Returns the raw token **once** and enqueues notifications.

- **Auth**: JWT Bearer
- **Allowed roles**: `AM`, `OP`
- **Audit**: yes (`tenant_portal.token_generated`, `actorType = USER`)
- **Side effects**: revokes all existing tokens for the appointment; enqueues EMAIL + SMS notifications.

**Path params**

| Name | Type | Notes |
|---|---|---|
| `appointmentId` | uuid | |

**Request body**: none.

**Response 201**

```json
{
  "rawToken": "a1b2c3...",
  "expiresAt": "2026-05-11T09:00:00.000Z"
}
```

> `rawToken` is returned only in this response. It never appears in logs, audits, or future responses.

**Error codes**: `FORBIDDEN`, `APPOINTMENT_NOT_FOUND`, `TENANT_NOT_FOUND`, `VALIDATION_ERROR`.

---

## GET `/v1/tenant-portal/:token`

Renter loads the portal data for an appointment. Read-only mode applies when the token is `EXPIRED`.

- **Auth**: portal token in URL path (SHA-256 hash lookup)
- **Rate limit**: 30 req/min per client

**Path params**

| Name | Type | Notes |
|---|---|---|
| `token` | string (hex) | Raw token from the unique link. |

**Response 200**

```json
{
  "tokenStatus": "ACTIVE|EXPIRED",
  "isReadOnly": false,
  "expiresAt": "ISO-8601",
  "appointment": {
    "id": "<uuid>",
    "scheduledDate": "2026-05-12",
    "timeSlot": "09:00-12:00",
    "status": "AWAITING_INSPECTOR",
    "tenantConfirmationStatus": "PENDING",
    "keyRequired": false,
    "meetingLocation": "string|null"
  },
  "property": {
    "street": "string",
    "suburb": "string",
    "state": "string",
    "postcode": "string"
  },
  "agency": {
    "name": "string",
    "contactEmail": "string|null"
  },
  "serviceType": {
    "name": "Routine Inspection",
    "flowType": "ROUTINE"
  },
  "contact": {
    "tenantName": "string",
    "primaryEmail": "string|null",
    "primaryPhone": "string|null"
  },
  "restriction": {
    "isHome": true,
    "unavailableDaysJson": ["SAT"],
    "unavailableHoursJson": ["18:00-20:00"],
    "notes": "string|null"
  }
}
```

**Error codes**: `PORTAL_TOKEN_INVALID` (404), `PORTAL_TOKEN_REVOKED` (410), `TOO_MANY_REQUESTS` (429).

---

## POST `/v1/tenant-portal/:token/confirm`

Renter confirms the appointment. Optionally submits restrictions.

- **Auth**: portal token
- **Rate limit**: 30 req/min
- **Audit**: yes (`tenant_portal.appointment_confirmed`, `actorType = ANONYMOUS`)
- **Side effects**: replaces existing restrictions; fires `onNotificationHandler`.

**Request body** (`confirmAppointmentPortalSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `restrictions` | object | no | `{ isHome, unavailableDaysJson?, unavailableHoursJson?, notes? }` |

**Response 200**

```json
{
  "tenantConfirmationStatus": "CONFIRMED",
  "confirmedAt": "ISO-8601"
}
```

Idempotent: calling confirm when already `CONFIRMED` returns the same shape without creating a duplicate activity.

**Error codes**: `PORTAL_TOKEN_INVALID`, `PORTAL_TOKEN_REVOKED`, `PORTAL_ACTION_BLOCKED` (expired token), `PORTAL_APPOINTMENT_INACTIVE`, `VALIDATION_ERROR`, `TOO_MANY_REQUESTS`.

---

## POST `/v1/tenant-portal/:token/reschedule`

Renter requests a new date and time slot. Only allowed for `ROUTINE` service types.

- **Auth**: portal token
- **Rate limit**: 30 req/min
- **Audit**: yes (`tenant_portal.appointment_rescheduled`, `actorType = ANONYMOUS`)
- **Side effects**: updates `scheduledDate`, `timeSlot`, resets `tenantConfirmationStatus = PENDING`, **revokes all portal tokens** for the appointment, optionally replaces restrictions, fires `onNotificationHandler`.

**Request body** (`rescheduleRequestPortalSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `newDate` | date (`YYYY-MM-DD`) | yes | Must not be in the past. Must be within 30 days of original. |
| `newTimeSlot` | string (`HH:mm-HH:mm`) | yes | |
| `restrictions` | object | no | Replaces existing restrictions if provided. |

**Response 200**

```json
{
  "scheduledDate": "2026-05-20",
  "timeSlot": "14:00-17:00",
  "tenantConfirmationStatus": "PENDING"
}
```

> After a successful reschedule, the token used to perform it is revoked. The operator must generate a new portal token for the renter to confirm the new date.

**Error codes**: `PORTAL_TOKEN_INVALID`, `PORTAL_TOKEN_REVOKED`, `PORTAL_ACTION_BLOCKED`, `PORTAL_APPOINTMENT_INACTIVE`, `PORTAL_RESCHEDULE_NOT_ALLOWED` (non-ROUTINE), `PORTAL_INSPECTION_IN_PROGRESS`, `PORTAL_DATE_IN_PAST`, `PORTAL_RESCHEDULE_WINDOW_EXCEEDED`, `APPOINTMENT_NOT_FOUND`, `VALIDATION_ERROR`.

---

## PATCH `/v1/tenant-portal/:token/contact`

Renter updates their contact details.

- **Auth**: portal token
- **Rate limit**: 30 req/min
- **Audit**: yes (`tenant_portal.contact_updated`, `actorType = ANONYMOUS`)

**Request body** (`updateContactPortalSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `tenantName` | string | no | |
| `primaryEmail` | email \| null | no | |
| `secondaryEmail` | email \| null | no | |
| `primaryPhone` | string \| null | no | |
| `secondaryPhone` | string \| null | no | |

At least one contact field must remain populated after the update.

**Response 200**: `{ contact: { ... } }`

**Error codes**: `PORTAL_TOKEN_INVALID`, `PORTAL_TOKEN_REVOKED`, `PORTAL_ACTION_BLOCKED`, `PORTAL_NO_CONTACT_FIELDS`, `VALIDATION_ERROR`.

---

## POST `/v1/tenant-portal/:token/unavailable`

Renter reports they cannot accommodate the current slot, without proposing a new one. Moves `tenantConfirmationStatus` to `UNAVAILABLE`. **This is the ONLY mutation permitted after the 7 PM cutoff** (unlike confirm, reschedule, and contact update which are blocked by `PORTAL_ACTION_BLOCKED`).

- **Auth**: portal token
- **Rate limit**: 30 req/min
- **Audit**: yes (`tenant_portal.unavailability_reported`, `actorType = ANONYMOUS`, includes `urgentMode` in metadata when token is expired)
- **Post-cutoff behavior**: when `isReadOnly = true` (token expired), the endpoint **succeeds** and flags the action as `urgentMode = true`, triggering immediate notifications to the operator and the assigned inspector. The portal does not decide the appointment's fate.

**Request body** (`reportUnavailabilityPortalSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `restrictions` | object | no | Optional details about the unavailability. |

**Response 200**

```json
{
  "tenantConfirmationStatus": "UNAVAILABLE",
  "urgentMode": false
}
```

> When called after cutoff: `urgentMode: true`. This signals that operator triage is required.

**Error codes**: `PORTAL_TOKEN_INVALID`, `PORTAL_TOKEN_REVOKED`, `PORTAL_APPOINTMENT_INACTIVE`, `PORTAL_INSPECTION_ALREADY_STARTED`, `VALIDATION_ERROR`. (Note: `PORTAL_ACTION_BLOCKED` does NOT apply to this endpoint — unavailability is explicitly permitted after cutoff.)
