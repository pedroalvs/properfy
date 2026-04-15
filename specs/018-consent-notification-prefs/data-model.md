# Data Model: Consent & Notification Preferences

**Feature**: 018-consent-notification-prefs
**Date**: 2026-04-10
**Status**: **DELIVERED (2026-04-11)** — the schema, enums, constraints, and audit actions described below were applied via migration `20260411000000_consent_notification_prefs` and are now the source of truth. No post-delivery deviation from this document. See `spec.md` "Delivery Outcome" for the end-to-end closure record.

## Entities

### 1. NotificationTemplate (extended)

Existing entity from 009. Extended with one new classification field.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (pk) | Existing |
| `tenantId` | UUID nullable | Existing; null = platform-default template |
| `templateCode` | String | Existing (e.g., `INSPECTION_CONFIRMED`, `REMINDER_7_DAYS`) |
| `channel` | `NotificationChannel` | Existing (EMAIL / SMS / WHATSAPP) |
| `subject` | String nullable | Existing |
| `bodyHtml` | String nullable | Existing |
| `bodyText` | String | Existing |
| `variablesJson` | JSON | Existing |
| `isActive` | Boolean | Existing |
| `whatsappApprovalStatus` | enum | Existing |
| **`notificationClass`** | **`NotificationClass` enum** | **NEW — TRANSACTIONAL / OPERATIONAL / MARKETING, default OPERATIONAL** |
| `createdAt` / `updatedAt` | timestamp | Existing |

**Validation**: `notificationClass` for protected template codes (listed in `PROTECTED_TEMPLATE_CLASSIFICATIONS` map) is immutable and must remain `TRANSACTIONAL`. Upsert attempts to change them are rejected with `PROTECTED_TEMPLATE_CLASSIFICATION`.

---

### 2. Notification (extended)

Existing entity. Extended with one new field.

| Field | Type | Notes |
|-------|------|-------|
| ...all existing fields... | | Unchanged |
| **`notificationClass`** | **`NotificationClass` enum nullable** | **NEW — stamped at creation time from the resolved template's class** |

**Rationale**: Storing the class on the notification decouples the send worker from the template. If the template class is later changed, in-flight notifications keep their original class (spec edge case "Template class change does not retroactively re-send").

**Backfill**: New column defaults to null; existing rows stay null and are treated as `OPERATIONAL` by the send worker as a conservative default.

---

### 3. NotificationConsent (extended)

Existing entity from 009. Extended with classification, audit trail, and override fields.

#### Existing fields (unchanged)

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (pk) | |
| `tenantId` | UUID | |
| `recipient` | String | Email address or phone number |
| `channel` | `NotificationChannel` | EMAIL / SMS / WHATSAPP |
| `optedOut` | Boolean | True = recipient has opted out |
| `optedOutAt` | timestamp nullable | Timestamp of last opt-out |
| `createdAt` / `updatedAt` | timestamp | |

#### New fields

| Field | Type | Notes |
|-------|------|-------|
| **`notificationClass`** | **`NotificationClass` enum** | **Required; default `OPERATIONAL`. Consent is scoped per class.** |
| **`changeSource`** | **`ConsentChangeSource` enum nullable** | `unsubscribe_link` / `operator_override` / `re_opt_in` |
| **`changedAt`** | **timestamp nullable** | Timestamp of the last status change (replaces `optedOutAt` semantically for new flows) |
| **`changedByUserId`** | **UUID FK to `user.id` nullable** | Set on operator override; null for public flows |
| **`reason`** | **text nullable** | Mandatory on operator override; null otherwise |

#### Constraints

- **Old unique constraint**: `UNIQUE(recipient, channel, tenantId)` — must be replaced
- **New unique constraint**: `UNIQUE(recipient, channel, tenantId, notificationClass)` — consent is per class

#### Status transitions

```
opted-in (default, no record or optedOut=false)
    │
    │ unsubscribe link clicked
    ▼
opted-out (optedOut=true, changeSource='unsubscribe_link')
    │
    ├── re-opt-in link clicked ──> opted-in (changeSource='re_opt_in')
    └── operator override ──────> opted-in (changeSource='operator_override', reason=?, changedByUserId=?)
```

**Invariant**: every status change writes one audit record via `AuditService` (see R10 in research).

---

### 4. UnsubscribeToken (runtime only, not persisted)

HMAC-SHA256 signed payload embedded in operational email footer links.

**Payload**:
```typescript
{
  recipient: string;         // email or phone
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
  tenantId: string;
  notificationClass: 'OPERATIONAL';  // Phase 1 only supports OPERATIONAL opt-out
  exp: number;               // Unix timestamp, 30 days from issue
}
```

**Encoded format**: `base64url(JSON(payload)) + '.' + base64url(HMAC-SHA256(payload, secret))`

**Verification**:
1. Split on `.`
2. Re-hash the payload with the secret and timing-safely compare to the signature
3. Decode the payload
4. Check `exp > Date.now()`
5. Return `{ valid: true, payload }` or `{ valid: false, reason }`

---

### 5. Audit records (existing `audit_logs` table — no schema change)

Consent changes produce audit records using the shared `AuditService`.

| action | actorType | Description |
|--------|-----------|-------------|
| `consent.opted_out_via_link` | `ANONYMOUS` | Public unsubscribe flow recorded |
| `consent.re_opted_in_via_link` | `ANONYMOUS` | Public re-opt-in flow recorded |
| `consent.override_opted_in` | `USER` | Operator override (with reason) |
| `notification.skipped_opt_out` | `SYSTEM` | Send worker skipped a notification due to consent |

---

## Enums

### NotificationClass (new, on shared package + Prisma)

```typescript
enum NotificationClass {
  TRANSACTIONAL = 'TRANSACTIONAL',
  OPERATIONAL = 'OPERATIONAL',
  MARKETING = 'MARKETING',
}
```

### ConsentChangeSource (new)

```typescript
enum ConsentChangeSource {
  unsubscribe_link = 'unsubscribe_link',
  operator_override = 'operator_override',
  re_opt_in = 're_opt_in',
}
```

### NotificationStatus (extended)

```typescript
enum NotificationStatus {
  PENDING,
  SENT,
  DELIVERED,
  FAILED,
  SKIPPED,            // existing — kept for non-consent skip reasons
  SKIPPED_OPT_OUT,    // NEW — consent decision
}
```

---

## Relationships

```
NotificationTemplate (1) ── notificationClass ──> NotificationClass enum
Notification         (1) ── notificationClass ──> NotificationClass enum (stamped at create time)
NotificationConsent  (N) ── tenantId + recipient + channel + notificationClass (composite unique)
NotificationConsent  (N) ── changedByUserId ──> User (nullable FK)

SendNotificationUseCase (runtime):
  notification.notificationClass
    │
    ├── TRANSACTIONAL → bypass consent check, dispatch
    ├── OPERATIONAL   → query NotificationConsent by scope; if opted out → SKIPPED_OPT_OUT
    └── MARKETING     → Phase 1: always blocked (no opt-in collection)
```

---

## Validation Rules

| Rule | Source FR | Enforcement layer |
|------|-----------|-------------------|
| `notificationClass` on template is required | FR-004 | Zod schema + use case |
| Protected template codes cannot be reclassified | FR-005 | `UpsertNotificationTemplateUseCase` consults protected map |
| Default `notificationClass` for non-protected templates is `OPERATIONAL` | FR-006 | Seed / upsert default |
| `TRANSACTIONAL` notifications bypass consent check | FR-013 | `SendNotificationUseCase` switch |
| `OPERATIONAL` notifications respect per-recipient opt-out per channel per tenant | FR-012 | `SendNotificationUseCase` → `consentRepo.findByScope(...)` |
| Every consent change produces one audit record | FR-018 | Use cases call `AuditService.log()` |
| Unsubscribe token expires after 30 days | FR-008 | `UnsubscribeTokenService.verify()` |
| Operator override requires mandatory `reason` | FR-016 | Zod schema `min(1)` + use case |
| Only AM/OP can access consent endpoints | FR-015, FR-017 | `AuthorizationService.assertRoles(['AM', 'OP'], ...)` |
| Consent is scoped per `(tenantId, recipient, channel, notificationClass)` | FR-001 | Composite unique constraint |

---

## Database Changes

### Migration: `<timestamp>_consent_notification_prefs`

```sql
-- 1. Create the NotificationClass enum
CREATE TYPE "NotificationClass" AS ENUM ('TRANSACTIONAL', 'OPERATIONAL', 'MARKETING');

-- 2. Create the ConsentChangeSource enum
CREATE TYPE "ConsentChangeSource" AS ENUM ('unsubscribe_link', 'operator_override', 're_opt_in');

-- 3. Add SKIPPED_OPT_OUT to NotificationStatus (additive — preserves existing rows)
ALTER TYPE "NotificationStatus" ADD VALUE 'SKIPPED_OPT_OUT';

-- 4. Extend notification_templates
ALTER TABLE "notification_templates"
  ADD COLUMN "notification_class" "NotificationClass" NOT NULL DEFAULT 'OPERATIONAL';

-- 5. Extend notifications
ALTER TABLE "notifications"
  ADD COLUMN "notification_class" "NotificationClass";

-- 6. Extend notification_consent
ALTER TABLE "notification_consent"
  ADD COLUMN "notification_class" "NotificationClass" NOT NULL DEFAULT 'OPERATIONAL',
  ADD COLUMN "change_source" "ConsentChangeSource",
  ADD COLUMN "changed_at" TIMESTAMP(3),
  ADD COLUMN "changed_by_user_id" TEXT,
  ADD COLUMN "reason" TEXT;

-- 7. Replace the old unique constraint with the new one (per class)
ALTER TABLE "notification_consent"
  DROP CONSTRAINT IF EXISTS "notification_consent_recipient_channel_tenant_id_key";
ALTER TABLE "notification_consent"
  ADD CONSTRAINT "notification_consent_recipient_channel_tenant_class_key"
  UNIQUE ("recipient", "channel", "tenant_id", "notification_class");

-- 8. FK for changed_by_user_id
ALTER TABLE "notification_consent"
  ADD CONSTRAINT "notification_consent_changed_by_user_id_fkey"
  FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- 9. Data migration: protected template codes → TRANSACTIONAL
UPDATE "notification_templates"
  SET "notification_class" = 'TRANSACTIONAL'
  WHERE "template_code" IN (
    'INSPECTION_CONFIRMED',
    'INSPECTION_RESCHEDULED',
    'INSPECTION_CANCELLED',
    'INSPECTION_UNAVAILABILITY_REPORTED'
  );
```

**Rollback**: Downgrade drops the new columns, enum values, and constraints. Safe because new columns have defaults and old rows are preserved.

**Index considerations**: No new indexes in this pass. The lookup query `WHERE tenant_id = ? AND recipient = ? AND channel = ? AND notification_class = ?` is covered by the new composite unique index. If the operator "list by recipient" query becomes slow, a future migration can add an index on `(tenant_id, recipient)`.

---

## State Transitions — Notification Lifecycle (augmented by 018)

```
          (create)            (send worker, class-aware)
   ┌─────> PENDING ────────────────────┐
   │                                     │
   │          consent check per class    │
   │             │                       │
   │             ▼                       │
   │    ┌─── TRANSACTIONAL ──────────────┤
   │    │                                 │
   │    │    OPERATIONAL                  │
   │    │    (opted-out?)                 │
   │    │     ├── yes ──> SKIPPED_OPT_OUT (terminal)
   │    │     └── no  ──> dispatch ──┬──> SENT ──> DELIVERED
   │    │                             │
   │    │                             └──> FAILED ──(retry)──> PENDING
   │    └─> dispatch (always)                                  │
   │                                                             │
   └─── SKIPPED (existing, other reasons: inactive tenant, etc.) ┘
```

018 adds the `SKIPPED_OPT_OUT` terminal state and the per-class branching in the send worker.
