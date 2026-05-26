# Design: Tenant Confirmation Cycles

**Date**: 2026-05-26
**Status**: Approved for planning
**Author**: Guia (via brainstorming session with Pedro)
**Scope**: Backend + Frontend (Portal Master Admin)

---

## 1. Problem

`tenantConfirmationStatus` is a single field on the appointment. It becomes semantically stale in several scenarios:

- **OP changes scheduled date or time slot**: the tenant confirmed a date/slot that no longer exists, but the field stays `CONFIRMED`.
- **Appointment reopened** (`REJECTED` or `CANCELLED` → `DRAFT`): confirmation from a previous lifecycle persists incorrectly.
- **Tenant reschedules via portal**: handled correctly today (reset to `PENDING`), but there is no history of why or how many cycles occurred.

Additionally, operators have no way to copy the active portal link from the appointment detail without generating a new token — which revokes the link already sent to the tenant.

---

## 2. Solution Overview

Introduce a formal `appointment_confirmation_cycles` table as the source of truth for each confirmation lifecycle. The existing `tenantConfirmationStatus` field on the appointment becomes a denormalized cache for query performance. A new `ConfirmationCycleService` domain service centralizes all cycle mutations.

Separately, store `raw_token_encrypted` on portal tokens (AES-256-GCM) to enable a "Copy Portal Link" button on the appointment detail without revoking the active token.

Cycles apply to **all appointments**, regardless of service type (`ROUTINE`, `INGOING`, `OUTGOING`). The blocking behavior (can't schedule without confirmation) remains scoped to `ROUTINE` with `requiresTenantConfirmation = true` — unchanged.

---

## 3. Data Model

### 3.1 New table: `appointment_confirmation_cycles`

```sql
id                  UUID        PRIMARY KEY
appointment_id      UUID        NOT NULL  REFERENCES appointments(id)
cycle_number        INTEGER     NOT NULL  -- monotonically increasing per appointment
scheduled_date      DATE        NOT NULL  -- snapshot of scheduled_date at cycle creation
time_slot           TEXT        NULL      -- snapshot of time_slot at cycle creation
status              TEXT        NOT NULL  -- PENDING | CONFIRMED | UNAVAILABLE | SUPERSEDED
confirmation_source TEXT        NULL      -- TENANT_PORTAL | OPERATOR_FORCED | TENANT_RESCHEDULE
confirmed_at        TIMESTAMPTZ NULL
invalidated_at      TIMESTAMPTZ NULL
invalidated_reason  TEXT        NULL      -- DATE_CHANGED | TIME_CHANGED | APPOINTMENT_REOPENED
portal_token_id     UUID        NULL      REFERENCES tenant_portal_tokens(id)
created_at          TIMESTAMPTZ NOT NULL  DEFAULT now()

UNIQUE (appointment_id, cycle_number)
INDEX (appointment_id, status)
```

**Cycle status transitions:**

```
PENDING     → CONFIRMED    (tenant confirms via portal or operator forces)
PENDING     → UNAVAILABLE  (tenant reports unavailability)
PENDING     → SUPERSEDED   (date/time change or appointment reopened)
CONFIRMED   → SUPERSEDED   (date/time change or appointment reopened)
UNAVAILABLE → SUPERSEDED   (date/time change or appointment reopened)
```

`SUPERSEDED` is terminal. Cycles never reactivate.

`cycle_number` is calculated as `MAX(cycle_number) + 1` for the appointment at creation time. Only one cycle per appointment may be in a non-SUPERSEDED status at any time — enforced in the application layer via `ConfirmationCycleService`.

### 3.2 Changes to `appointments`

| Column | Change |
|--------|--------|
| `tenant_confirmation_status` | Kept — denormalized mirror of the active cycle's status. Source of truth for filters, dashboard, inspector PWA. |
| `active_confirmation_cycle_id` | **New** — nullable FK to `appointment_confirmation_cycles`. NULL when no active cycle exists (e.g., appointment not yet SCHEDULED, or reopened). |

### 3.3 Changes to `tenant_portal_tokens`

| Column | Change |
|--------|--------|
| `raw_token_encrypted` | **New** — TEXT, nullable. AES-256-GCM encrypted raw token. Key sourced from env `PORTAL_TOKEN_ENC_KEY`. Enables the "Copy Portal Link" feature without regenerating the token. |

---

## 4. Invalidation Rules

### 4.1 Triggers and behavior

| Event | Actor | Active cycle | New cycle | Email |
|-------|-------|-------------|-----------|-------|
| Scheduled date changes | OP, AM | `SUPERSEDED` (`DATE_CHANGED`) | `PENDING` created | Yes — auto-resend |
| Time slot changes | OP, AM | `SUPERSEDED` (`TIME_CHANGED`) | `PENDING` created | Yes — auto-resend |
| Tenant reschedules via portal | TNT | `SUPERSEDED` | `PENDING` created → immediately `CONFIRMED` (`TENANT_RESCHEDULE`) | No |
| `REJECTED`/`CANCELLED` → `DRAFT` | OP, AM, SYS | `SUPERSEDED` (`APPOINTMENT_REOPENED`) | None — appointment not SCHEDULED | No |
| Appointment → `SCHEDULED` | SYS, OP | — | `PENDING` created (cycle 1 or N) | Yes |

Inspector and contact changes do **not** invalidate the confirmation cycle.

### 4.2 Where invalidation happens

**`update-appointment.use-case.ts`** — when `scheduledDate` or `timeSlot` change:
1. Call `ConfirmationCycleService.rotateOnDateChange()`
2. Revoke existing portal tokens
3. Auto-send `INSPECTION_NOTICE` with new portal link

**`execute-status-transition.use-case.ts`** — two situations:
- Transition `→ SCHEDULED`: call `ConfirmationCycleService.createInitial()`
- Transition `REJECTED|CANCELLED → DRAFT`: call `ConfirmationCycleService.invalidateOnReopen()`

---

## 5. Domain Service: `ConfirmationCycleService`

Single entry point for all cycle mutations. Lives in `apps/backend/src/modules/appointment/domain/confirmation-cycle.service.ts`.

```typescript
interface ConfirmationCycleService {
  // Supersede active cycle, create new PENDING, trigger resend
  rotateOnDateChange(
    appointmentId: string,
    newDate: Date,
    newTimeSlot: string | null,
    reason: 'DATE_CHANGED' | 'TIME_CHANGED',
  ): Promise<ConfirmationCycle>;

  // Supersede active cycle, create new cycle immediately CONFIRMED (no email)
  rotateOnTenantReschedule(
    appointmentId: string,
    newDate: Date,
    newTimeSlot: string | null,
  ): Promise<ConfirmationCycle>;

  // Confirm active cycle
  confirm(
    appointmentId: string,
    source: 'TENANT_PORTAL' | 'OPERATOR_FORCED',
    tokenId: string | null,
  ): Promise<ConfirmationCycle>;

  // Mark active cycle UNAVAILABLE
  markUnavailable(appointmentId: string): Promise<ConfirmationCycle>;

  // Supersede active cycle, no new cycle (appointment reopened)
  invalidateOnReopen(appointmentId: string): Promise<void>;

  // Create first PENDING cycle (appointment → SCHEDULED)
  createInitial(
    appointmentId: string,
    scheduledDate: Date,
    timeSlot: string | null,
    tokenId: string | null,
  ): Promise<ConfirmationCycle>;
}
```

Every method atomically:
1. Writes to `appointment_confirmation_cycles`
2. Updates `appointment.tenant_confirmation_status` (denorm)
3. Updates `appointment.active_confirmation_cycle_id`

---

## 6. Portal Token Changes

### 6.1 Encrypted raw token storage

On token generation, in addition to the SHA-256 hash, encrypt the raw token with AES-256-GCM using `PORTAL_TOKEN_ENC_KEY` (env var) and store in `raw_token_encrypted`.

### 6.2 New endpoint: Copy Portal Link

```
GET /v1/appointments/:id/portal-link
Authorization: AM, OP only
```

Response:
```json
{
  "portalUrl": "https://portal.properfy.app/t/<rawToken>",
  "expiresAt": "2026-05-31T09:00:00Z"
}
```

Behavior:
- Finds the current `ACTIVE` token for the appointment
- Decrypts `raw_token_encrypted`
- Returns the full portal URL
- Does NOT generate a new token
- Does NOT revoke anything
- Returns `404` if no active token exists

### 6.3 Token validity with cycles

Portal middleware gains an additional check after token validation: if the token's linked `portal_token_id` cycle is `SUPERSEDED`, respond with `PORTAL_TOKEN_REVOKED` (410) — the link is semantically expired even if the token record is technically `ACTIVE`.

---

## 7. Use Case Changes

### `confirm-appointment.use-case.ts`
- Call `ConfirmationCycleService.confirm(appointmentId, 'TENANT_PORTAL', tokenId)`
- Rest unchanged (restrictions, activity, audit, notification)

### `reschedule-request.use-case.ts`
- Call `ConfirmationCycleService.rotateOnTenantReschedule()`
- Tokens revoked (tenant's own link is now stale; they already acted)
- No email sent

### `report-unavailability.use-case.ts`
- Call `ConfirmationCycleService.markUnavailable(appointmentId)`
- Rest unchanged (urgentMode, notifications, audit)

### `force-manual-confirmation.use-case.ts`
- Call `ConfirmationCycleService.confirm(appointmentId, 'OPERATOR_FORCED', null)`

### `generate-portal-token.use-case.ts`
- After minting token, call `ConfirmationCycleService.createInitial()` if no active PENDING cycle exists
- Link `portal_token_id` on the cycle to the new token
- Store `raw_token_encrypted` on the token

---

## 8. Worker Changes

### `reject-unconfirmed` (09:00 UTC, D-1)
- Before rejecting, call `ConfirmationCycleService.invalidateOnReopen()` to supersede the active cycle
- `tenant_confirmation_status` transitions to `NO_RESPONSE` as today (not a cycle status — remains a terminal appointment field set by the worker)

### `dispatch-escalations` (08:00 UTC, D-2)
- No change — reads `appointment.tenant_confirmation_status` (denorm field)

### `dispatch-reminders` (08:00 UTC, D-7/D-5/D-3)
- No change — reads `appointment.tenant_confirmation_status` (denorm field)

---

## 9. Frontend Changes

### Appointment detail — "Copy Portal Link" button

Location: appointment detail page, alongside the existing "Send Portal Link" button. Visible to AM and OP only.

| Button | Behavior |
|--------|----------|
| **Send Portal Link** | Generates new token, revokes previous, sends email to tenant |
| **Copy Portal Link** | Calls `GET /v1/appointments/:id/portal-link`, copies URL to clipboard, shows "Link copied" toast |

"Copy Portal Link" is disabled with tooltip `"No active portal link — generate one first"` when no active token exists for the appointment.

---

## 10. Key Decisions

| Decision | Rationale |
|----------|-----------|
| Cycles for all service types | Portal link is sent to all appointments on SCHEDULED; validity tracking is useful regardless of flow type. Blocking behavior remains ROUTINE-only. |
| Denormalized `tenantConfirmationStatus` on appointment | Zero regression on existing queries, filters, dashboard, inspector PWA. Source of truth is cycles table. |
| AES-256-GCM for raw token storage | Enables Copy Link without multiple token proliferation. Key in env, never in DB. |
| `ConfirmationCycleService` as single entry point | Prevents the supersede + create pattern from being duplicated across use cases. |
| One non-SUPERSEDED cycle per appointment enforced in application layer | Simpler than DB constraint; transitions are always explicit and controlled by the service. |

---

## 11. Out of Scope

- Migrating existing appointments to have a `cycle_number = 1` retroactively — historical data stays as-is; cycles start from the first transition post-deploy.
- Exposing cycle history to tenants via the portal — they see current state only.
- Configurable `PORTAL_TOKEN_ENC_KEY` rotation — key rotation is an ops concern, not in this feature.
