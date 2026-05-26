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

CREATE UNIQUE INDEX "appointment_confirmation_cycles_portal_token_id_unique"
  ON "appointment_confirmation_cycles" ("portal_token_id");

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

-- 5. Now that tokens have confirmation_cycle_id, add the back-reference FK on cycles -> tokens

ALTER TABLE "appointment_confirmation_cycles"
  ADD CONSTRAINT "appointment_confirmation_cycles_portal_token_id_fkey"
  FOREIGN KEY ("portal_token_id") REFERENCES "tenant_portal_tokens"("id") ON DELETE SET NULL;

-- 6. Add SUPERSEDED value to TenantPortalTokenStatus enum (028 — tokens superseded by new cycle)

ALTER TYPE "TenantPortalTokenStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';

-- 7. No backfill — pre-existing appointments keep tenant_confirmation_status untouched.
--    First cycle event after deploy creates the first cycle row.
