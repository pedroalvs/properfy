# Tenant Portal Module – Implementation Spec

> **SUPERSEDED** by `specs/007-tenant-portal/` — this legacy spec is preserved for historical reference only.

**Version:** 1.0
**Module path:** `apps/backend/src/modules/tenant-portal`
**Last updated:** 2026-03-15

---

## 1. Overview

### Purpose

The Tenant Portal module provides a public-facing, token-authenticated interface for tenants (inquilinos) to view their upcoming inspection details and interact with the appointment without requiring an account. Authentication is entirely token-based: a unique URL containing an opaque token is delivered via email/SMS, and the token itself authorizes all portal actions.

This module does NOT use JWT authentication. The `Authorization` header is not required. The URL token replaces the auth mechanism entirely.

### Actors

| Actor | Interaction |
|---|---|
| TNT | All portal actions (view, confirm, reschedule, update contact, report unavailability) |
| OP | Manual confirmation override; no direct portal endpoint (via appointments module) |
| AM | No direct portal interaction |

### Domain Boundaries

- Owns: `TenantPortalToken`, `TenantPortalActivity` entities
- Reads: `Appointment`, `AppointmentContact`, `AppointmentRestriction`, `Property`, `ServiceType`
- Writes to: `AppointmentContact` (contact update), `AppointmentRestriction` (restriction fields), `Appointment.tenantConfirmationStatus`
- Emits domain events consumed by: Notifications module (WhatsApp/SMS alerts), Appointments state machine (reschedule request)
- Does NOT own: appointment state transitions (delegated to Appointments module), notification sending

### Timezone note

All deadline comparisons (e.g., the 7:00 PM cutoff) use the tenant's (agency's) configured timezone stored in `tenants.timezone`. Default fallback: `Australia/Sydney`.

---

## 2. Data Model

### 2.1 Enums

#### `TenantPortalTokenStatus`

```prisma
enum TenantPortalTokenStatus {
  ACTIVE   // Token is valid and usable
  EXPIRED  // Token passed its expires_at timestamp
  REVOKED  // Token explicitly invalidated by system or operator
}
```

#### `TenantPortalAction`

```prisma
enum TenantPortalAction {
  VIEW                // Tenant opened/viewed the portal
  CONFIRM             // Tenant confirmed the inspection
  RESCHEDULE          // Tenant submitted a reschedule request
  CONTACT_UPDATED     // Tenant updated contact information
  UNAVAILABLE_REPORTED // Tenant reported unavailability
}
```

#### `TenantConfirmationStatus` (shared enum, defined in appointments module)

```prisma
enum TenantConfirmationStatus {
  PENDING    // No response yet from tenant
  CONFIRMED  // Tenant confirmed the inspection
  UNAVAILABLE // Tenant reported unavailability
  NO_RESPONSE // Deadline passed with no tenant action
}
```

### 2.2 Entity: `TenantPortalToken`

**Table:** `tenant_portal_tokens`

| Field | Prisma Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| id | String | No | `uuid()` | PK |
| appointment_id | String | No | — | FK → appointments.id |
| token_hash | String | No | — | unique; SHA-256 of raw token |
| expires_at | DateTime | No | — | set to 7:00 PM day-before inspection in tenant tz |
| status | TenantPortalTokenStatus | No | `ACTIVE` | enum |
| last_accessed_at | DateTime | Yes | — | updated on every GET /tenant-portal/:token |
| created_at | DateTime | No | `now()` | |
| updated_at | DateTime | No | `now()` | auto-updated |

**Indexes:**

```prisma
model TenantPortalToken {
  id             String                   @id @default(uuid())
  appointment_id String
  token_hash     String                   @unique
  expires_at     DateTime
  status         TenantPortalTokenStatus  @default(ACTIVE)
  last_accessed_at DateTime?
  created_at     DateTime                 @default(now())
  updated_at     DateTime                 @updatedAt

  appointment    Appointment              @relation(fields: [appointment_id], references: [id])
  activities     TenantPortalActivity[]

  @@index([appointment_id])
  @@index([status])
  @@index([expires_at])
  @@map("tenant_portal_tokens")
}
```

**Raw token:** generated as 32-byte cryptographically random hex string (`crypto.randomBytes(32).toString('hex')`). Only the SHA-256 hash is stored. The raw token is embedded in the portal URL and never stored.

### 2.3 Entity: `TenantPortalActivity`

**Table:** `tenant_portal_activities`

| Field | Prisma Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| id | String | No | `uuid()` | PK |
| appointment_id | String | No | — | FK → appointments.id |
| tenant_portal_token_id | String | No | — | FK → tenant_portal_tokens.id |
| action | TenantPortalAction | No | — | enum |
| previous_values_json | Json | Yes | — | snapshot before change |
| new_values_json | Json | Yes | — | snapshot after change |
| ip_address | String | Yes | — | from X-Forwarded-For or socket |
| user_agent | String | Yes | — | from request header |
| created_at | DateTime | No | `now()` | immutable |

```prisma
model TenantPortalActivity {
  id                     String              @id @default(uuid())
  appointment_id         String
  tenant_portal_token_id String
  action                 TenantPortalAction
  previous_values_json   Json?
  new_values_json        Json?
  ip_address             String?
  user_agent             String?
  created_at             DateTime            @default(now())

  appointment            Appointment         @relation(fields: [appointment_id], references: [id])
  token                  TenantPortalToken   @relation(fields: [tenant_portal_token_id], references: [id])

  @@index([appointment_id])
  @@index([tenant_portal_token_id])
  @@index([action])
  @@index([created_at])
  @@map("tenant_portal_activities")
}
```

### 2.4 Referenced entities (read-only from this module)

The following fields on `appointments` and related tables are read or written by this module but owned by the Appointments module:

- `appointments.tenant_confirmation_status` — written via `confirmAppointment`, `reportUnavailability`
- `appointments.scheduled_date`, `appointments.time_slot` — written via `rescheduleRequest`
- `appointment_contacts.primary_email`, `.secondary_email`, `.primary_phone`, `.secondary_phone` — written via `updateContact`
- `appointment_restrictions.*` — written via `confirmAppointment` (optional restrictions), `rescheduleRequest`

---

## 3. Use Cases

### 3.1 `getPortalData`

**Actor:** TNT (via token URL)
**Input:** raw token (URL param `:token`)

**Steps:**

1. Hash the raw token with SHA-256.
2. Look up `TenantPortalToken` by `token_hash` where `status = ACTIVE`.
3. If not found → `PORTAL_TOKEN_INVALID`.
4. Check `expires_at`:
   - If `now() > expires_at` AND token status is still `ACTIVE`: update token `status = EXPIRED` (lazy expiry), return `isReadOnly: true`.
   - If `now() <= expires_at`: `isReadOnly: false`.
5. Update `last_accessed_at = now()`.
6. Load appointment with: `property`, `serviceType`, `appointmentContact`, `appointmentRestriction`.
7. Record `TenantPortalActivity` with `action = VIEW`.
8. Return portal data payload.

**Output shape:**

```typescript
{
  token: {
    status: "ACTIVE" | "EXPIRED" | "REVOKED",
    expiresAt: string, // ISO 8601
    isReadOnly: boolean,
  },
  appointment: {
    id: string,
    status: AppointmentStatus,
    scheduledDate: string,       // YYYY-MM-DD
    timeSlot: string,
    serviceType: { code: string, name: string },
    property: {
      street: string,
      addressLine2: string | null,
      suburb: string,
      postcode: string,
      state: string,
      country: string,
    },
    tenantConfirmationStatus: TenantConfirmationStatus,
    keyRequired: boolean,
    meetingLocationJson: object | null,
    notes: string | null,
  },
  contact: {
    tenantName: string | null,
    primaryEmail: string | null,
    secondaryEmail: string | null,
    primaryPhone: string | null,
    secondaryPhone: string | null,
  },
  restrictions: {
    isHome: boolean | null,
    unavailableDaysJson: string[] | null,
    unavailableHoursJson: object[] | null,
    notes: string | null,
    source: string | null,
  },
}
```

### 3.2 `confirmAppointment`

**Actor:** TNT
**Input:** raw token, optional restrictions body

**Steps:**

1. Resolve and validate token (same as 3.1 steps 1-4).
2. If `isReadOnly: true` → `PORTAL_ACTION_BLOCKED` (past cutoff).
3. If appointment `tenantConfirmationStatus` is already `CONFIRMED` → idempotent return (no error, no duplicate activity).
4. If appointment `status` is `CANCELLED` or `DONE` or `REJECTED` → `PORTAL_APPOINTMENT_INACTIVE`.
5. Snapshot previous values: `tenantConfirmationStatus`, restrictions.
6. Within a DB transaction:
   a. Update `appointment.tenantConfirmationStatus = CONFIRMED`.
   b. If restrictions provided, upsert `appointment_restrictions` with `source = 'TENANT_PORTAL'`.
   c. Create `TenantPortalActivity` with `action = CONFIRM`, `previous_values_json`, `new_values_json`.
7. Emit domain event `tenant_portal.appointment_confirmed` (picked up by Notifications module).
8. Return updated confirmation status.

### 3.3 `rescheduleRequest`

**Actor:** TNT
**Input:** raw token, `newDate`, `newTimeSlot`, optional restrictions

**Steps:**

1. Resolve and validate token.
2. If `isReadOnly: true` → `PORTAL_ACTION_BLOCKED`.
3. Validate service type allows TNT reschedule (only `Routine Inspection` with `service_type.flow_type = ROUTINE`). If not → `PORTAL_RESCHEDULE_NOT_ALLOWED`.
4. Validate `newDate`:
   - Must not be in the past.
   - Must be within 30 days of the original `scheduledDate`. If beyond → `PORTAL_RESCHEDULE_WINDOW_EXCEEDED`.
5. Validate appointment `status` is `SCHEDULED`. Other statuses → `PORTAL_APPOINTMENT_INACTIVE`.
6. Snapshot previous values.
7. Within a DB transaction:
   a. Update `appointment.scheduledDate = newDate`, `appointment.timeSlot = newTimeSlot`.
   b. Update `appointment.tenantConfirmationStatus = PENDING` (reschedule resets confirmation).
   c. Upsert `appointment_restrictions` if provided, with `source = 'TENANT_PORTAL'`.
   d. Create `TenantPortalActivity` with `action = RESCHEDULE`.
8. Emit domain event `tenant_portal.reschedule_requested` (Notifications module sends confirmation email; Appointments module may re-evaluate service group assignment).
9. Return updated appointment dates and status.

### 3.4 `updateContact`

**Actor:** TNT
**Input:** raw token, at least one of: `primaryEmail`, `secondaryEmail`, `primaryPhone`, `secondaryPhone`

**Steps:**

1. Resolve and validate token (contact update is allowed even when read-only — see Business Rule 11).
2. Validate that at least one field is provided → `PORTAL_NO_CONTACT_FIELDS`.
3. Validate email format (if provided) with Zod `z.string().email()`.
4. Validate phone format (if provided): E.164 or local Australian format normalized to E.164.
5. Snapshot previous contact values.
6. Within a DB transaction:
   a. Upsert `appointment_contacts` with provided fields (only update non-null fields; do NOT overwrite existing with null).
   b. Create `TenantPortalActivity` with `action = CONTACT_UPDATED`.
7. Do NOT propagate changes to `users` or agency-level contact records.
8. Return updated contact.

### 3.5 `reportUnavailability`

**Actor:** TNT
**Input:** raw token, optional restrictions (unavailableDays, unavailableHours, notes)

**Steps:**

1. Resolve and validate token.
2. If `isReadOnly: true` → trigger urgent unavailability flow (see Business Rule 3):
   a. Update `appointment.tenantConfirmationStatus = UNAVAILABLE`.
   b. Create `TenantPortalActivity` with `action = UNAVAILABLE_REPORTED`.
   c. Emit `tenant_portal.urgent_unavailability_reported` event (Notifications sends WhatsApp to inspector; OP notified).
   d. Return with `urgentMode: true`.
3. If `isReadOnly: false`:
   a. If already `UNAVAILABLE` → idempotent return.
   b. If `status` is `CANCELLED`, `DONE`, `REJECTED` → `PORTAL_APPOINTMENT_INACTIVE`.
   c. Snapshot previous values.
   d. Within DB transaction: update `tenantConfirmationStatus = UNAVAILABLE`, upsert restrictions, create activity.
   e. Emit `tenant_portal.unavailability_reported` event.
4. Return updated status.

---

## 4. API Contracts

### Authentication mechanism

All `/v1/tenant-portal/:token` endpoints use NO JWT authentication. The `:token` path parameter is the raw token. A dedicated Fastify plugin (`tenantPortalTokenPlugin`) resolves and validates the token before reaching the handler, attaching a `portalContext` to the request.

### 4.1 `GET /v1/tenant-portal/:token`

**Purpose:** Load portal data for display.

**Request:**

```
GET /v1/tenant-portal/:token
```

No request body. No Authorization header.

**Response 200:**

```json
{
  "token": {
    "status": "ACTIVE",
    "expiresAt": "2026-03-20T19:00:00.000+10:00",
    "isReadOnly": false
  },
  "appointment": {
    "id": "uuid",
    "status": "SCHEDULED",
    "scheduledDate": "2026-03-21",
    "timeSlot": "09:00-11:00",
    "serviceType": { "code": "ROUTINE", "name": "Routine Inspection" },
    "property": {
      "street": "123 Main St",
      "addressLine2": null,
      "suburb": "Bondi",
      "postcode": "2026",
      "state": "NSW",
      "country": "AU"
    },
    "tenantConfirmationStatus": "PENDING",
    "keyRequired": false,
    "meetingLocationJson": null,
    "notes": null
  },
  "contact": {
    "tenantName": "John Smith",
    "primaryEmail": "john@example.com",
    "secondaryEmail": null,
    "primaryPhone": "+61412345678",
    "secondaryPhone": null
  },
  "restrictions": {
    "isHome": null,
    "unavailableDaysJson": null,
    "unavailableHoursJson": null,
    "notes": null,
    "source": null
  }
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 404 | `PORTAL_TOKEN_INVALID` | Token not found or not ACTIVE/EXPIRED |
| 410 | `PORTAL_TOKEN_REVOKED` | Token status is REVOKED |

### 4.2 `POST /v1/tenant-portal/:token/confirm`

**Purpose:** Tenant confirms the inspection.

**Request body (Zod schema):**

```typescript
const ConfirmAppointmentSchema = z.object({
  restrictions: z.object({
    isHome: z.boolean().nullable().optional(),
    unavailableDaysJson: z.array(z.string()).nullable().optional(),
    unavailableHoursJson: z.array(z.object({
      start: z.string(), // HH:MM
      end: z.string(),   // HH:MM
    })).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  }).optional(),
});
```

**Response 200:**

```json
{
  "tenantConfirmationStatus": "CONFIRMED",
  "confirmedAt": "2026-03-19T10:23:00.000Z"
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 404 | `PORTAL_TOKEN_INVALID` | Token not found |
| 403 | `PORTAL_ACTION_BLOCKED` | Past 7:00 PM cutoff (isReadOnly) |
| 409 | `PORTAL_APPOINTMENT_INACTIVE` | Appointment in CANCELLED/DONE/REJECTED status |

### 4.3 `POST /v1/tenant-portal/:token/reschedule`

**Purpose:** Tenant requests a new date/time.

**Request body (Zod schema):**

```typescript
const RescheduleRequestSchema = z.object({
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  newTimeSlot: z.string().min(1).max(50),
  restrictions: z.object({
    isHome: z.boolean().nullable().optional(),
    unavailableDaysJson: z.array(z.string()).nullable().optional(),
    unavailableHoursJson: z.array(z.object({
      start: z.string(),
      end: z.string(),
    })).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  }).optional(),
});
```

**Response 200:**

```json
{
  "scheduledDate": "2026-03-25",
  "timeSlot": "10:00-12:00",
  "tenantConfirmationStatus": "PENDING"
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 404 | `PORTAL_TOKEN_INVALID` | Token not found |
| 403 | `PORTAL_ACTION_BLOCKED` | Past 7:00 PM cutoff |
| 403 | `PORTAL_RESCHEDULE_NOT_ALLOWED` | Service type does not permit TNT reschedule |
| 409 | `PORTAL_APPOINTMENT_INACTIVE` | Appointment not in SCHEDULED status |
| 422 | `PORTAL_RESCHEDULE_WINDOW_EXCEEDED` | newDate > 30 days from original scheduledDate |
| 422 | `PORTAL_DATE_IN_PAST` | newDate is in the past |

### 4.4 `PATCH /v1/tenant-portal/:token/contact`

**Purpose:** Tenant updates contact information on the appointment record.

**Request body (Zod schema):**

```typescript
const UpdateContactSchema = z.object({
  primaryEmail: z.string().email().optional(),
  secondaryEmail: z.string().email().nullable().optional(),
  primaryPhone: z.string().min(8).max(20).optional(),
  secondaryPhone: z.string().min(8).max(20).nullable().optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: "At least one contact field must be provided" }
);
```

**Response 200:**

```json
{
  "contact": {
    "tenantName": "John Smith",
    "primaryEmail": "newemail@example.com",
    "secondaryEmail": null,
    "primaryPhone": "+61412345678",
    "secondaryPhone": null
  }
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 404 | `PORTAL_TOKEN_INVALID` | Token not found |
| 422 | `PORTAL_NO_CONTACT_FIELDS` | No fields provided |
| 422 | `VALIDATION_ERROR` | Invalid email or phone format |

### 4.5 `POST /v1/tenant-portal/:token/unavailable`

**Purpose:** Tenant reports unavailability for the scheduled inspection.

**Request body (Zod schema):**

```typescript
const ReportUnavailabilitySchema = z.object({
  restrictions: z.object({
    unavailableDaysJson: z.array(z.string()).nullable().optional(),
    unavailableHoursJson: z.array(z.object({
      start: z.string(),
      end: z.string(),
    })).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  }).optional(),
});
```

**Response 200:**

```json
{
  "tenantConfirmationStatus": "UNAVAILABLE",
  "urgentMode": false
}
```

When `urgentMode: true` (past cutoff), the response still returns `200` with `urgentMode: true` to signal that the urgent flow was triggered.

---

## 5. Business Rules

1. **Token validity window:** A portal token is valid from creation until 7:00 PM (19:00) in the tenant's configured timezone (`tenants.timezone`) on the day immediately before the scheduled inspection date. Example: inspection on 2026-03-21, token expires 2026-03-20T19:00:00 in tenant timezone.

2. **Read-only after cutoff:** Once `now() > expires_at`, the portal switches to read-only mode. The tenant can still VIEW all data but cannot perform CONFIRM, RESCHEDULE, or UNAVAILABLE_REPORTED actions (except as defined in Rule 3).

3. **Urgent unavailability after cutoff:** If a tenant reports unavailability AFTER the 7:00 PM cutoff, the system authorizes an urgent rejection flow: `tenantConfirmationStatus` is set to `UNAVAILABLE`, activity is recorded, and a WhatsApp notification is immediately dispatched to the assigned inspector informing them the service has been cancelled. The operator is also notified. This flow bypasses the read-only restriction specifically for unavailability reporting.

4. **Contact updates are always allowed:** Tenants may update their contact information at any time while the token is `ACTIVE` or `EXPIRED` (but NOT `REVOKED`). Contact updates do not count as "action-blocked" operations and work in read-only mode.

5. **Token is not single-use:** The same token can be used multiple times until it expires. There is no burn-after-read mechanism. Multiple CONFIRM or VIEW actions by the same token are allowed (idempotent where applicable).

6. **Token generation:** Tokens are generated when the appointment transitions to `SCHEDULED` status. One active token per appointment at any time. If a token already exists for an appointment, generating a new one revokes the previous one (sets `status = REVOKED`) before creating the new one.

7. **Confirm is idempotent:** If `tenantConfirmationStatus` is already `CONFIRMED` and the tenant sends another confirm request, the system returns success without creating a duplicate activity log entry.

8. **Reschedule resets confirmation status:** Any successful reschedule via the portal sets `tenantConfirmationStatus = PENDING`, requiring re-confirmation.

9. **Reschedule window:** Maximum 30 days from the original scheduled date. Minimum: the new date must not be in the past and must not be within the read-only window (i.e., must be at least 1 day in the future from now).

10. **Reschedule allowed only for Routine Inspection:** Only service types with `flow_type = ROUTINE` allow TNT reschedule. `Ingoing` and `Outgoing` inspections do not allow tenant-initiated reschedule via the portal.

11. **No contact field overwrites with null:** When updating contact, only provided fields are updated. A `null` value in the request body means "clear this field." Omitted fields are untouched.

12. **All portal interactions audited:** Every request to an action endpoint (confirm, reschedule, updateContact, unavailable) must create a `TenantPortalActivity` record, including IP address and User-Agent.

13. **VIEW activity recorded only once per session (best-effort):** For GET requests, record a VIEW activity. If the same token makes multiple GET requests in a short window, the system MAY deduplicate VIEW activities (within a 5-minute window) to avoid activity log pollution, but this is not a hard requirement.

14. **Inactive appointments are blocked:** If the appointment is in `CANCELLED`, `DONE`, or `REJECTED` status at the time of action, all mutating operations return `PORTAL_APPOINTMENT_INACTIVE`.

15. **Token REVOKED vs EXPIRED:** `REVOKED` tokens return `410 PORTAL_TOKEN_REVOKED`. `EXPIRED` tokens return the portal data with `isReadOnly: true`. The distinction exists because REVOKED may indicate a security event, whereas EXPIRED is a normal lifecycle state.

16. **Restriction fields are optional:** No restriction field is mandatory. The only required element in confirm/reschedule bodies is the action itself. Restrictions enrich operational context but do not block confirmation if absent.

17. **Source tracking:** When restrictions are written by the portal, `appointment_restrictions.source = 'TENANT_PORTAL'` is recorded. This differentiates tenant-provided restrictions from operator-entered ones (`source = 'OPERATOR'`).

18. **Rate limiting:** Tenant portal endpoints are rate-limited to 30 requests per minute per IP to prevent abuse (no user account to rate-limit against).

---

## 6. Authorization Matrix

| Endpoint | TNT (valid token) | TNT (expired token) | TNT (revoked token) | OP/AM (JWT) |
|---|---|---|---|---|
| GET /v1/tenant-portal/:token | Allowed | Allowed (read-only) | Denied (410) | N/A (no JWT auth here) |
| POST /.../confirm | Allowed | Denied (403) | Denied (410) | N/A |
| POST /.../reschedule | Allowed | Denied (403) | Denied (410) | N/A |
| PATCH /.../contact | Allowed | Allowed | Denied (410) | N/A |
| POST /.../unavailable | Allowed | Allowed (urgent mode) | Denied (410) | N/A |

**Important:** Operator overrides (e.g., manual confirmation) are performed through the Appointments module API with JWT authentication, not through the portal endpoints.

---

## 7. Domain Events

All events are emitted to the in-process event bus (and optionally to pg-boss for async consumers).

### `tenant_portal.appointment_viewed`

```typescript
{
  event: "tenant_portal.appointment_viewed",
  payload: {
    appointmentId: string,
    tokenId: string,
    ipAddress: string | null,
    userAgent: string | null,
    timestamp: string, // ISO 8601
  }
}
```

### `tenant_portal.appointment_confirmed`

```typescript
{
  event: "tenant_portal.appointment_confirmed",
  payload: {
    appointmentId: string,
    tenantId: string,
    tokenId: string,
    confirmedAt: string,
  }
}
```

**Consumers:** Notifications module (send confirmation email to tenant and agency contact).

### `tenant_portal.reschedule_requested`

```typescript
{
  event: "tenant_portal.reschedule_requested",
  payload: {
    appointmentId: string,
    tenantId: string,
    tokenId: string,
    previousDate: string,
    previousTimeSlot: string,
    newDate: string,
    newTimeSlot: string,
  }
}
```

**Consumers:** Notifications module (send reschedule confirmation email); Appointments module (may re-evaluate service group).

### `tenant_portal.unavailability_reported`

```typescript
{
  event: "tenant_portal.unavailability_reported",
  payload: {
    appointmentId: string,
    tenantId: string,
    tokenId: string,
    urgentMode: boolean,  // true if past cutoff
    restrictions: object | null,
    reportedAt: string,
  }
}
```

**Consumers:** Notifications module. If `urgentMode: true`, dispatches WhatsApp to inspector and email/push to operator.

### `tenant_portal.contact_updated`

```typescript
{
  event: "tenant_portal.contact_updated",
  payload: {
    appointmentId: string,
    tokenId: string,
    updatedFields: string[],  // e.g. ["primaryEmail", "primaryPhone"]
    updatedAt: string,
  }
}
```

---

## 8. Queue Jobs

### `tenant-portal.expire-tokens` (scheduled cron)

**Purpose:** Batch-mark ACTIVE tokens as EXPIRED when `expires_at < now()`.

**Schedule:** Every 15 minutes.

**Payload:** None (scans DB).

**Logic:**

```sql
UPDATE tenant_portal_tokens
SET status = 'EXPIRED', updated_at = now()
WHERE status = 'ACTIVE' AND expires_at < now();
```

This is a safety net. Lazy expiry (at request time) handles most cases.

### `tenant-portal.send-portal-link` (triggered by appointments module)

**Purpose:** Send the portal URL to the tenant when a token is generated.

**Trigger:** `appointment.transitioned_to_scheduled` event.

**Payload:**

```typescript
{
  jobName: "tenant-portal.send-portal-link",
  payload: {
    appointmentId: string,
    rawToken: string,     // ONLY in transit via job queue; never stored after sending
    tenantEmail: string | null,
    tenantPhone: string | null,
    scheduledDate: string,
    propertyAddress: string,
  }
}
```

---

## 9. External Integrations

### SMS (Twilio / Zenvia)

- Used for the urgent unavailability WhatsApp alert to inspector.
- Channel: WhatsApp via Twilio Business Messaging or Zenvia.
- Triggered by `tenant_portal.urgent_unavailability_reported` with `urgentMode: true`.
- Message template: "URGENT: Inspection at {address} on {date} has been cancelled by the tenant. Please check your schedule."

### Email (Resend)

- Portal link delivered via email when appointment is scheduled.
- Confirmation email sent when tenant confirms.
- Reschedule confirmation email sent on reschedule.

---

## 10. Test Scenarios

### Unit Tests (Vitest)

#### `resolveToken` utility

- **PASS:** valid SHA-256 hash lookup returns token with `status = ACTIVE`.
- **FAIL:** unknown hash throws `PORTAL_TOKEN_INVALID`.
- **FAIL:** revoked token throws `PORTAL_TOKEN_REVOKED`.
- **LAZY EXPIRE:** token with `expires_at < now()` and `status = ACTIVE` is updated to `EXPIRED` and returns `isReadOnly: true`.

#### `getPortalData` use case

- Returns full appointment, contact, restrictions, and token metadata.
- Records VIEW activity with IP and User-Agent.
- Does NOT expose `token_hash` or internal IDs in response.

#### `confirmAppointment` use case

- Successful confirmation sets `tenantConfirmationStatus = CONFIRMED`.
- Emits `tenant_portal.appointment_confirmed`.
- Idempotent: second confirm returns success without duplicate activity.
- Blocked when `isReadOnly: true`.
- Blocked when appointment is `CANCELLED`.

#### `rescheduleRequest` use case

- Valid reschedule updates `scheduledDate` and `timeSlot`, resets `tenantConfirmationStatus = PENDING`.
- Emits `tenant_portal.reschedule_requested`.
- Blocked when `isReadOnly: true`.
- Blocked for Ingoing/Outgoing service type.
- Fails if `newDate` > 30 days from original.
- Fails if `newDate` is in the past.

#### `updateContact` use case

- Updates only provided fields; untouched fields remain unchanged.
- Null values clear the field.
- Works in read-only mode (expired token).
- Fails with `PORTAL_NO_CONTACT_FIELDS` if body is empty.
- Fails with `VALIDATION_ERROR` for invalid email.

#### `reportUnavailability` use case

- Sets `tenantConfirmationStatus = UNAVAILABLE` when within window.
- Triggers urgent mode when `isReadOnly: true`; emits with `urgentMode: true`.
- Idempotent if already `UNAVAILABLE`.

### Integration Tests (Supertest)

#### `GET /v1/tenant-portal/:token`

- 200 with full data for valid active token.
- 200 with `isReadOnly: true` for expired token.
- 404 for unknown token.
- 410 for revoked token.
- Records VIEW in `tenant_portal_activities`.

#### `POST /v1/tenant-portal/:token/confirm`

- 200 on valid confirmation.
- 403 when past cutoff.
- 409 for cancelled appointment.
- 200 (idempotent) on second confirm.

#### `POST /v1/tenant-portal/:token/reschedule`

- 200 with updated dates.
- 403 for non-ROUTINE service type.
- 422 for date > 30 days out.
- 403 when past cutoff.

#### `PATCH /v1/tenant-portal/:token/contact`

- 200 updates only provided fields.
- 422 for invalid email format.
- 200 even when token is expired (contact update allowed post-cutoff).

#### `POST /v1/tenant-portal/:token/unavailable`

- 200 with `urgentMode: false` within window.
- 200 with `urgentMode: true` past cutoff; inspector WhatsApp job enqueued.

#### Rate limiting

- 31st request from same IP within 1 minute → 429.

### Edge Cases

- Token for appointment that has since been cancelled → `PORTAL_APPOINTMENT_INACTIVE` on mutating actions, data still readable.
- Multiple tokens for same appointment (previous revoked, new active) → only active token works.
- Reschedule to same date/timeslot → accepted (system does not block same-value updates).
- Contact update with all null values → `PORTAL_NO_CONTACT_FIELDS`.
