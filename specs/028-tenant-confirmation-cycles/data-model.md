# Data Model — Tenant Confirmation Cycles

**Feature:** 028-tenant-confirmation-cycles
**Migration name:** `20260526000000_appointment_confirmation_cycles`

---

## 1. Prisma Schema Diff

### 1.1 New model: `AppointmentConfirmationCycle`

Add to `apps/backend/prisma/schema.prisma` after the `Appointment` model.

```prisma
enum CycleStatus {
  PENDING
  CONFIRMED
  UNAVAILABLE
  SUPERSEDED
}

enum CycleConfirmationSource {
  TENANT_PORTAL
  OPERATOR_FORCED
  TENANT_RESCHEDULE
}

enum CycleInvalidatedReason {
  DATE_CHANGED
  TIME_CHANGED
  APPOINTMENT_REOPENED
  TENANT_RESCHEDULE
}

model AppointmentConfirmationCycle {
  id                  String                    @id @default(uuid())
  appointment_id      String
  cycle_number        Int
  scheduled_date      DateTime                  @db.Date
  time_slot           String?
  status              CycleStatus               @default(PENDING)
  confirmation_source CycleConfirmationSource?
  confirmed_at        DateTime?
  invalidated_at      DateTime?
  invalidated_reason  CycleInvalidatedReason?
  portal_token_id     String?
  created_at          DateTime                  @default(now())

  appointment     Appointment        @relation(fields: [appointment_id], references: [id], onDelete: Cascade)
  portal_token    TenantPortalToken? @relation("CycleMintedToken", fields: [portal_token_id], references: [id], onDelete: SetNull)
  active_for      Appointment[]      @relation("ActiveCycle")
  tokens_for_cycle TenantPortalToken[] @relation("TokenCycle")

  @@unique([appointment_id, cycle_number])
  @@index([appointment_id, status])
  @@map("appointment_confirmation_cycles")
}
```

### 1.2 Changes to `Appointment` model

Add two relations and one column:

```prisma
model Appointment {
  // ... existing fields ...
  active_confirmation_cycle_id String?
  active_confirmation_cycle    AppointmentConfirmationCycle? @relation("ActiveCycle", fields: [active_confirmation_cycle_id], references: [id], onDelete: SetNull)

  confirmation_cycles          AppointmentConfirmationCycle[]
  // ... rest unchanged ...
}
```

**No change** to `tenant_confirmation_status` column itself — it stays as `TenantConfirmationStatus @default(PENDING)`. Only the writers change.

### 1.3 Changes to `TenantPortalToken` model

```prisma
model TenantPortalToken {
  // ... existing fields ...
  raw_token_encrypted    String?
  confirmation_cycle_id  String?
  confirmation_cycle     AppointmentConfirmationCycle? @relation("TokenCycle", fields: [confirmation_cycle_id], references: [id], onDelete: SetNull)
  minted_for_cycle       AppointmentConfirmationCycle? @relation("CycleMintedToken")
  // ... rest unchanged ...
}
```

---

## 2. Migration SQL

File: `apps/backend/prisma/migrations/20260526000000_appointment_confirmation_cycles/migration.sql`

```sql
-- 028-tenant-confirmation-cycles
-- Adds appointment_confirmation_cycles as source of truth for confirmation lifecycle.
-- tenant_confirmation_status on appointments becomes a denormalized cache.
-- Raw token encryption (AES-256-GCM) added to tenant_portal_tokens for Copy Portal Link feature.

-- 1. Enums

CREATE TYPE "CycleStatus" AS ENUM ('PENDING', 'CONFIRMED', 'UNAVAILABLE', 'SUPERSEDED');
CREATE TYPE "CycleConfirmationSource" AS ENUM ('TENANT_PORTAL', 'OPERATOR_FORCED', 'TENANT_RESCHEDULE');
CREATE TYPE "CycleInvalidatedReason" AS ENUM ('DATE_CHANGED', 'TIME_CHANGED', 'APPOINTMENT_REOPENED', 'TENANT_RESCHEDULE');

-- 2. Table appointment_confirmation_cycles

CREATE TABLE "appointment_confirmation_cycles" (
  "id"                  TEXT PRIMARY KEY,
  "appointment_id"      TEXT NOT NULL,
  "cycle_number"        INTEGER NOT NULL,
  "scheduled_date"      DATE NOT NULL,
  "time_slot"           TEXT,
  "status"              "CycleStatus" NOT NULL DEFAULT 'PENDING',
  "confirmation_source" "CycleConfirmationSource",
  "confirmed_at"        TIMESTAMPTZ,
  "invalidated_at"      TIMESTAMPTZ,
  "invalidated_reason"  "CycleInvalidatedReason",
  "portal_token_id"     TEXT,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "appointment_confirmation_cycles_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "appointment_confirmation_cycles_appt_cycle_num_unique"
  ON "appointment_confirmation_cycles" ("appointment_id", "cycle_number");

CREATE INDEX "appointment_confirmation_cycles_appt_status_idx"
  ON "appointment_confirmation_cycles" ("appointment_id", "status");

-- Concurrency safety net (Planejador round 1): prevents two concurrent
-- createInitial / rotate calls from inserting two active cycles for the
-- same appointment. ConfirmationCycleService handles P2002 by re-reading
-- the active cycle and retrying once via the "link to existing" branch.
CREATE UNIQUE INDEX "appointment_active_cycle_unique"
  ON "appointment_confirmation_cycles" ("appointment_id")
  WHERE "status" != 'SUPERSEDED';

-- 3. Add active_confirmation_cycle_id to appointments

ALTER TABLE "appointments"
  ADD COLUMN "active_confirmation_cycle_id" TEXT;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_active_confirmation_cycle_id_fkey"
  FOREIGN KEY ("active_confirmation_cycle_id")
  REFERENCES "appointment_confirmation_cycles"("id")
  ON DELETE SET NULL;

-- 4. Add raw_token_encrypted and confirmation_cycle_id to tenant_portal_tokens

ALTER TABLE "tenant_portal_tokens"
  ADD COLUMN "raw_token_encrypted" TEXT,
  ADD COLUMN "confirmation_cycle_id" TEXT;

ALTER TABLE "tenant_portal_tokens"
  ADD CONSTRAINT "tenant_portal_tokens_confirmation_cycle_id_fkey"
  FOREIGN KEY ("confirmation_cycle_id")
  REFERENCES "appointment_confirmation_cycles"("id")
  ON DELETE SET NULL;

-- 5. Now that tokens have confirmation_cycle_id, add the back-reference FK on cycles → tokens

ALTER TABLE "appointment_confirmation_cycles"
  ADD CONSTRAINT "appointment_confirmation_cycles_portal_token_id_fkey"
  FOREIGN KEY ("portal_token_id") REFERENCES "tenant_portal_tokens"("id") ON DELETE SET NULL;

-- 6. No backfill — pre-existing appointments keep tenant_confirmation_status untouched.
--    First cycle event after deploy creates the first cycle row.
```

**Rollback** (not run automatically, documented for ops):

```sql
DROP INDEX "appointment_active_cycle_unique";
ALTER TABLE "appointment_confirmation_cycles" DROP CONSTRAINT "appointment_confirmation_cycles_portal_token_id_fkey";
ALTER TABLE "tenant_portal_tokens" DROP CONSTRAINT "tenant_portal_tokens_confirmation_cycle_id_fkey";
ALTER TABLE "tenant_portal_tokens" DROP COLUMN "confirmation_cycle_id";
ALTER TABLE "tenant_portal_tokens" DROP COLUMN "raw_token_encrypted";
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_active_confirmation_cycle_id_fkey";
ALTER TABLE "appointments" DROP COLUMN "active_confirmation_cycle_id";
DROP TABLE "appointment_confirmation_cycles";
DROP TYPE "CycleInvalidatedReason";
DROP TYPE "CycleConfirmationSource";
DROP TYPE "CycleStatus";
```

---

## 3. Shared (`packages/shared`) Schema Additions

Add to `packages/shared/src/enums.ts` (or wherever appointment enums live):

```typescript
export const CycleStatus = z.enum(['PENDING', 'CONFIRMED', 'UNAVAILABLE', 'SUPERSEDED']);
export type CycleStatus = z.infer<typeof CycleStatus>;

export const CycleConfirmationSource = z.enum(['TENANT_PORTAL', 'OPERATOR_FORCED', 'TENANT_RESCHEDULE']);
export type CycleConfirmationSource = z.infer<typeof CycleConfirmationSource>;

export const CycleInvalidatedReason = z.enum(['DATE_CHANGED', 'TIME_CHANGED', 'APPOINTMENT_REOPENED', 'TENANT_RESCHEDULE']);
export type CycleInvalidatedReason = z.infer<typeof CycleInvalidatedReason>;
```

Add Zod response schema for the new endpoint:

```typescript
export const GetPortalLinkResponse = z.object({
  portalUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});
export type GetPortalLinkResponse = z.infer<typeof GetPortalLinkResponse>;
```

Add error codes for the endpoint:

```typescript
export const PortalLinkErrorCode = z.enum([
  'NO_ACTIVE_PORTAL_TOKEN',
  'PORTAL_TOKEN_NOT_DECRYPTABLE',
  'APPOINTMENT_NOT_FOUND',
]);
```

---

## 4. Env Schema

Add to `apps/backend/src/main/env.ts` Zod schema:

```typescript
PORTAL_TOKEN_ENC_KEY: z
  .string()
  .min(44, 'PORTAL_TOKEN_ENC_KEY must be at least 44 chars (32 bytes base64) or 64 chars (32 bytes hex)')
  .optional()
  .describe('AES-256-GCM key for encrypting tenant portal raw tokens. Required in staging/prod.'),
```

Strict-runtime guard: same pattern as existing `TOTP_ENCRYPTION_KEY` — when `NODE_ENV === 'production'` or `'staging'`, throw on startup if undefined.

---

## 5. Invariants

| Invariant | Enforcement layer |
|-----------|-------------------|
| Only one non-`SUPERSEDED` cycle per appointment at any time | **Both layers**: (a) `ConfirmationCycleService` wraps supersede-old + insert-new in single transaction; (b) **DB partial unique index** `appointment_active_cycle_unique` rejects concurrent racing inserts with `P2002`. Service handles the error by re-reading the active cycle and retrying once via the "link to existing" branch. |
| `appointments.tenant_confirmation_status` mirrors active cycle status (`PENDING`/`CONFIRMED`/`UNAVAILABLE`) when `active_confirmation_cycle_id IS NOT NULL` | `ConfirmationCycleService` — every mutator writes both rows in same transaction |
| `appointments.tenant_confirmation_status = 'NO_RESPONSE'` ⇔ `active_confirmation_cycle_id IS NULL` AND last cycle was superseded by `reject-unconfirmed` worker | `ConfirmationCycleService.invalidateOnReject()` invoked inside the worker's outer `$transaction` |
| `cycle_number` monotonically increasing per appointment | `ConfirmationCycleService.rotateOn*` / `createInitial` — compute `MAX(cycle_number) + 1` inside transaction |
| `tenant_portal_tokens.confirmation_cycle_id` references the cycle the token was minted for; `appointment_confirmation_cycles.portal_token_id` references the token that minted it | `GeneratePortalTokenUseCase` — opens outer `prisma.$transaction` and passes `tx` to both `MintPortalTokenService.mint(tx)` (returns `tokenId`) and `ConfirmationCycleService.createInitial(..., tokenId, tx)`. Bidirectional FK set atomically. |
| Token with `SUPERSEDED` cycle is treated as revoked | `portal-token-middleware.ts` — joins cycle and rejects with `PORTAL_TOKEN_REVOKED` (410) |

---

## 6. Query Implications

| Query | Path |
|-------|------|
| List appointments filtered by `tenantConfirmationStatus` | Unchanged — reads denorm column on `appointments`. |
| Inspector PWA T-1 visibility | Unchanged — `T1VisibilityService` continues reading denorm column. |
| Dashboard alerts (027) "Confirmed this week" | Unchanged — denorm column. |
| Reject-unconfirmed worker `findUnconfirmedForDate` | Unchanged — denorm column. |
| New: list cycles for an appointment (admin debugging) | Read directly from `appointment_confirmation_cycles` ordered by `cycle_number`. |
| New: `GET /v1/appointments/:id/portal-link` | Reads token via `findActiveByAppointmentId` then joins to cycle via `confirmation_cycle_id` to check it's not `SUPERSEDED`. |

---

## 7. Test Data Considerations

- **Seed scripts** (`apps/backend/src/scripts/seed-perf-027.ts` etc.) — no change needed since appointments are created without cycles; the first cycle event after creation triggers cycle insertion via the service.
- **Integration test fixtures** — when constructing a `SCHEDULED` appointment for testing confirm flows, callers must also call `ConfirmationCycleService.createInitial()` (or use a test helper that does so), otherwise the confirm flow has no cycle to confirm.
- **Per `feedback_mock_masks_real_bug.md`** — `ConfirmationCycleService` integration tests must use Testcontainers Postgres, not mocks; the transaction boundary is the invariant under test.
