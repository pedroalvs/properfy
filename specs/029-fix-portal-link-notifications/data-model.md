# Phase 1 Data Model: Fix Portal Link Notifications

**Date**: 2026-05-27
**Spec**: `./spec.md`
**Plan**: `./plan.md`
**Research**: `./research.md`

## Scope

**No new entities. No new columns. No migrations.** This document inventories the existing surfaces touched by the bug fix so the Executor (and future readers) can audit the consistency of the changes against the schema as it stands today.

---

## Entities read by the bug fix

### 1. `appointments`

Path: `prisma/schema.prisma` (model `Appointment`, mapped to `appointments`).

| Field | Type | Used here for | Touched? |
|---|---|---|---|
| `id` | UUID PK | `findById` lookup | NO |
| `tenant_id` | UUID FK | Tenant scope check | NO |
| `active_confirmation_cycle_id` | UUID? | Was misused as the `hasActivePortalToken` proxy (line 166 of `get-appointment.use-case.ts`); **read by the bug fix only to confirm the proxy is being replaced**; remains on the entity unchanged | NO (semantic-only change in consumer) |
| `deleted_at` | TIMESTAMP? | Existing soft-delete filter | NO |
| (all other fields) | — | Unchanged | NO |

### 2. `tenant_portal_tokens`

Path: `prisma/schema.prisma` (model `TenantPortalToken`, mapped to `tenant_portal_tokens`). Definition at lines 968–989.

| Field | Type | Used here for | Touched? |
|---|---|---|---|
| `id` | UUID PK | Returned in `select: { id: true }` of the new filtered include | READ ONLY |
| `appointment_id` | UUID FK → `appointments(id)` | Join filter | READ ONLY |
| `status` | `TenantPortalTokenStatus` enum | Active-check predicate (`= 'ACTIVE'`) | READ ONLY |
| `expires_at` | TIMESTAMPTZ | Active-check predicate (`> new Date()` — Node clock per spec AC-2.5) | READ ONLY |

Indexes already in place (schema.prisma:986-988): `(appointment_id)`, `(status)`, `(expires_at)` — these support the filtered include's predicate.

Enum values for `status`: `ACTIVE | EXPIRED | REVOKED | SUPERSEDED` (per Regras B.1 and schema). Only `ACTIVE` AND `expires_at > now()` qualifies.

### 3. `notifications`

Path: `prisma/schema.prisma` (model `Notification`).

| Field | Type | Used here for | Touched? |
|---|---|---|---|
| `status` | `NotificationStatus` enum | Read at SEND-time by `SendNotificationUseCase`; observed in repro/QA logs | READ ONLY |
| `next_retry_at` | TIMESTAMPTZ? | Read by `notification.retry-poll` worker, unchanged | NO |
| `provider_message_id` | TEXT? | Written on success by `SendNotificationUseCase`, **observed** in AC-1.5 verification | NO |
| `payload_json` | JSONB | Untouched; instrumented log around `enqueue` does NOT inspect payload contents (no PII leakage risk) | NO |
| (all other fields) | — | Unchanged | NO |

### 4. `pgboss.job` (PG-boss managed schema)

Not directly written by application code. Inspected during R-1 reproduction:

```sql
SELECT id, name, state, data, created_on, completed_on
FROM pgboss.job
WHERE name = 'notification.send'
ORDER BY created_on DESC
LIMIT 5;
```

Used to confirm whether a job row exists for a given `notificationId` after the API responds 201. **Read-only access during diagnosis; no application writes outside the existing `boss.send` path.**

---

## Application-layer derived types changed by the bug fix

### `AppointmentWithRelations` (file: `apps/backend/src/modules/appointment/domain/appointment.repository.ts`)

Existing interface gains one new field:

```typescript
export interface AppointmentWithRelations {
  appointment: AppointmentEntity;
  contact: AppointmentContactEntity | null;
  contacts: AppointmentContactEntity[];
  restrictions: AppointmentRestrictionEntity[];
  propertyCode: string;
  propertyAddress: string;
  propertySuburb: string;
  propertyLatitude: number | null;
  propertyLongitude: number | null;
  branchName: string;
  serviceTypeName: string;
  inspectorName: string | null;
  tenantName: string;
  tenantAppointmentCodePrefix: string | null;
  // NEW (Bug 2):
  hasActivePortalToken: boolean;
}
```

Semantics: `true` iff at least one row in `tenant_portal_tokens` with `appointment_id = appointment.id AND status = 'ACTIVE' AND expires_at > new Date()` was visible to the query at the moment `findById` ran.

### `GetAppointmentOutput.hasActivePortalToken` (file: `apps/backend/src/modules/appointment/application/use-cases/get-appointment.use-case.ts`)

- **Before** (line 166): `hasActivePortalToken: appointment.activeConfirmationCycleId !== null` — PROXY, semantically incorrect per Regras B.1.
- **After**: `hasActivePortalToken: found.hasActivePortalToken` — sourced directly from the repository's typed result.

### `GetPortalLinkUseCase.execute` early-reject (file: `apps/backend/src/modules/tenant-portal/application/use-cases/get-portal-link.use-case.ts`) — Planejador round-1 alignment

- **Before** (lines 44-46): `if (!appointment.activeConfirmationCycleId) throw new NoActivePortalTokenError();` — SAME proxy that was being removed from `GetAppointmentUseCase`. Leaving it created a backend semantic inconsistency: `hasActivePortalToken: true` (real token alive) while this endpoint rejected with 409.
- **After**: lines 44-46 removed; the existing `findActiveByAppointmentId` call at line 48 (post-T028: validates `expires_at > now()`) becomes the sole "active token" authority. Audit emission at lines 66-74 unchanged. Contract details in `contracts/portal-link-endpoint.contract.md`.

---

## API response shape changed by the bug fix

### `appointmentResponseSchema` (file: `packages/shared/src/schemas/responses.ts`)

| Field | Before | After | Note |
|---|---|---|---|
| `hasActivePortalToken` | `z.boolean().optional()` (line 236) | `z.boolean()` | Tightening; spec §3.A.2 round-2 fix; contract update with consumer audit complete (apps/web + apps/pwa + packages/shared/api-types.ts all type as optional on receive — strengthening is forward-compatible). |

No other field changes.

---

## State transitions affected

None. The bug fix does not introduce new states, status enums, or transitions in any module.

---

## Validation rules added/changed

None at the data layer. The fix is at the read path (`findById`) and at one schema declaration in the shared package. No new write paths.

---

## Backward-compatibility audit (per CQ-4 round-2 resolution)

Schema tightening of `hasActivePortalToken: z.boolean().optional()` → `z.boolean()` strengthens the producer contract (always present) and narrows the consumer expectation (no longer needs to handle `undefined`). All known consumers in the monorepo:

| Consumer file | Current expectation | Compatible? |
|---|---|---|
| `apps/web/src/features/appointments/types/index.ts:71` | `hasActivePortalToken?: boolean` | ✓ — typed optional, accepts narrower required-boolean |
| `packages/shared/src/api-types.ts:4987` | `hasActivePortalToken?: boolean` | ✓ — same |
| `apps/web/src/features/appointments/pages/AppointmentDetailPage.tsx:248,254` | reads as boolean, no undefined-handling visible | ✓ — strengthened API removes the `undefined` case |
| `apps/web/src/features/appointments/pages/AppointmentDetailPage.test.tsx:89,410,422` | tests mock with explicit boolean | ✓ |
| `apps/pwa` | grep returns no usage of this field | N/A |

**Result**: zero break risk. The OpenAPI-generated types in `api-types.ts` will be regenerated as part of the build to reflect the tightening.

---

## Summary

| Surface | Change | Type |
|---|---|---|
| `appointments` table | none | — |
| `tenant_portal_tokens` table | none (read by filtered include) | — |
| `notifications` table | none | — |
| `pgboss.job` | none (diagnostic read only) | — |
| `AppointmentWithRelations` interface | +1 field | additive |
| `GetAppointmentOutput.hasActivePortalToken` semantic | proxy → real check | corrective |
| `appointmentResponseSchema.hasActivePortalToken` | optional → required | tightening (low-risk) |

**No migrations, no schema diffs, no breaking external API changes.** Ready for Phase 2 (`/speckit.tasks`).
