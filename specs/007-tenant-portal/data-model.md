# Data Model: Tenant Portal

**Feature**: `007-tenant-portal`
**Status**: IMPLEMENTED
**Source**: `apps/backend/prisma/schema.prisma` (`TenantPortalToken`, `TenantPortalActivity`, `TenantPortalTokenStatus`, `TenantPortalAction`), `apps/backend/src/modules/tenant-portal/domain/**`

All timestamps are `timestamptz`. All IDs are UUID v4. Column names follow `snake_case`; the Prisma client exposes them as `camelCase`.

## Enums

### `TenantPortalTokenStatus`

```
ACTIVE | EXPIRED | REVOKED
```

- `ACTIVE` — usable. Default on creation.
- `EXPIRED` — past `expires_at`. The portal enters restricted mode: confirm, reschedule, and contact update are blocked; `UNAVAILABLE` is the only mutation still permitted (late emergency exception, flagged `urgentMode = true`).
- `REVOKED` — terminal. Never reactivates. A new token must be generated.

Token status transitions:

```
ACTIVE ─── (now > expires_at) ──▶ EXPIRED
ACTIVE ─── (new token generated / reschedule) ──▶ REVOKED
EXPIRED ─── (never) ──▶ (no outward transition; only via fresh token)
```

### `TenantPortalAction`

```
VIEW | CONFIRM | RESCHEDULE | CONTACT_UPDATED | UNAVAILABLE_REPORTED
```

Corresponds one-to-one to the portal endpoints (plus `VIEW` for the GET).

## Entities

### `tenant_portal_tokens`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `appointment_id` | uuid | no | — | FK → `appointments.id`. One appointment can have multiple historical tokens, but only one should be `ACTIVE` at a time. |
| `token_hash` | text | no | — | **UNIQUE**. SHA-256 hex digest of the raw token. The raw token is NEVER stored. |
| `expires_at` | timestamptz | no | — | 7 PM local-time day-before `scheduledDate`, in the tenant's timezone, converted to UTC. |
| `status` | `TenantPortalTokenStatus` | no | `ACTIVE` | |
| `last_accessed_at` | timestamptz | yes | — | Updated on every middleware lookup. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes**

- `UNIQUE (token_hash)`
- `(appointment_id)`
- `(status)`
- `(expires_at)` — used by the sweep worker.

**Invariants**

- At most one `ACTIVE` token per `appointment_id` at any time. Enforced by the application layer: `generate-portal-token.use-case.ts` revokes all existing tokens before inserting a new one.
- `token_hash` uniqueness across the entire table (not just per appointment). Hash collisions would be cryptographic failures.
- `status = REVOKED` is terminal — no code path transitions out of it.
- `expires_at` is computed once at creation and never updated.

### `tenant_portal_activities`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `appointment_id` | uuid | no | — | FK → `appointments.id`. |
| `tenant_portal_token_id` | uuid | no | — | FK → `tenant_portal_tokens.id`. Ties each action to the token that authorized it. |
| `action` | `TenantPortalAction` | no | — | |
| `previous_values_json` | jsonb | yes | — | Pre-change snapshot for mutations; null for VIEW. |
| `new_values_json` | jsonb | yes | — | Post-change snapshot for mutations; null for VIEW. |
| `ip_address` | varchar(45) | yes | — | From `X-Forwarded-For` or request IP. |
| `user_agent` | varchar | yes | — | |
| `created_at` | timestamptz | no | `now()` | |

**Indexes**

- `(appointment_id)`
- `(tenant_portal_token_id)`
- `(action)`
- `(created_at)`

**Invariants**

- Append-only. Rows are never updated or deleted (except by retention policies, which are not yet implemented).
- Every successful mutation (confirm, reschedule, contact update, unavailability) produces exactly one row with `previous_values_json` and `new_values_json` populated.
- The GET endpoint does NOT currently write a `VIEW` activity row. `VIEW` exists in the `TenantPortalAction` enum but is not produced by any code path in Phase 1 (`implementation decision` — the enum value is reserved for a future telemetry enhancement tracked as tasks.md T204). Consumers of `tenant_portal_activities` must not assume `VIEW` rows exist.

## Runtime-only types

### `PortalContext` (request-scoped)

Produced by the portal token middleware and attached to `request.portalContext` for every portal handler.

| Field | Type | Notes |
|---|---|---|
| `tokenId` | string (uuid) | |
| `appointmentId` | string (uuid) | |
| `isReadOnly` | boolean | `true` when the token is `EXPIRED`. |
| `tokenStatus` | string | `ACTIVE|EXPIRED|REVOKED` (filtered by middleware — `REVOKED` throws before the handler runs). |
| `expiresAt` | string (ISO 8601) | |

## Domain Logic

### `TokenService`

Pure functions, no I/O:

- `generateRawToken()` → 32 random bytes as hex (64 chars).
- `hashToken(rawToken)` → SHA-256 hex digest.
- `computeExpiresAt(scheduledDate: 'YYYY-MM-DD', timezone: string)` → `Date` representing 7 PM local-time on the day before `scheduledDate`, converted to UTC. Uses `Intl.DateTimeFormat` to handle DST.

### Middleware (`createPortalTokenMiddleware`)

- Extracts `:token` from the URL.
- Rejects missing tokens with `PORTAL_TOKEN_INVALID`.
- Hashes the token and looks it up by `token_hash`.
- Rejects `REVOKED` tokens with `PORTAL_TOKEN_REVOKED`.
- Transitions `ACTIVE → EXPIRED` inline when `expires_at < now()` and sets `isReadOnly = true`.
- Populates `request.portalContext` and continues to the handler.

## Ports (domain interfaces)

### `ITenantPortalTokenRepository`

- `save(token)`
- `findByTokenHash(tokenHash)` — returns the entity or null. Updates `last_accessed_at` as a side effect (verify implementation).
- `findByAppointmentId(appointmentId)` — for sweep/maintenance.
- `updateStatus(tokenId, appointmentId, status)` — used by the middleware and by the expire worker.
- `revokeAllForAppointment(appointmentId)` — called from `generate-portal-token` and `reschedule-request`.

### `ITenantPortalActivityRepository`

- `save(activity)` — append-only.
- `findByAppointmentId(appointmentId)` — reserved for GAP-005 (activity export endpoint).

## Relationships

```
appointments (feature 006)
  └── tenant_portal_tokens (0..*)
         └── tenant_portal_activities (0..*)
```

- `tenant_portal_tokens.appointment_id → appointments.id` (no cascade; historical tokens outlive deleted appointments).
- `tenant_portal_activities.tenant_portal_token_id → tenant_portal_tokens.id` (no cascade; activities outlive revoked tokens).
- `tenant_portal_activities.appointment_id → appointments.id` (redundant with token FK but useful for direct queries).

## Audit Linkage

Actions emitted via `AuditService` with `actorType = 'ANONYMOUS'`:

- `tenant_portal.token_generated` — emitted by the operator endpoint with `actorType = USER` and the operator's id. This is the only portal audit action where the actor is a named user.
- `tenant_portal.appointment_confirmed`
- `tenant_portal.appointment_rescheduled`
- `tenant_portal.contact_updated`
- `tenant_portal.unavailability_reported`

All anonymous entries carry `ipAddress` in addition to the standard audit fields.

## Side Effects Summary

| Use case | Token writes | Appointment writes | Activity row | Notification |
|---|---|---|---|---|
| Generate token (operator) | Revoke old + insert new | — | — | Enqueue EMAIL + SMS via `CreateNotificationUseCase` |
| Get portal data | `last_accessed_at` (via middleware lookup) | — | — | — |
| Confirm | — | `tenantConfirmationStatus = CONFIRMED`, replace restrictions | CONFIRM | `onNotificationHandler` fire-and-forget |
| Reschedule | Revoke all for appointment | `scheduledDate`, `timeSlot`, `tenantConfirmationStatus = PENDING`, replace restrictions | RESCHEDULE | `onNotificationHandler` |
| Update contact | — | Contact row update | CONTACT_UPDATED | — |
| Report unavailability | — | `tenantConfirmationStatus = UNAVAILABLE`, optional restrictions | UNAVAILABLE_REPORTED | — |

## Migration History

Phase 1 schema applied in `apps/backend/prisma/migrations/`. Any Phase 2 change to token semantics (e.g., single-use tokens in GAP-003) requires expand/contract migrations with backward compatibility for in-flight tokens.
