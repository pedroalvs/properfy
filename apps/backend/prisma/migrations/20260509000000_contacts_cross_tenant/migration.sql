-- Feature 024: Contact becomes cross-tenant. Aborts if dedup pre-check finds collisions.
--
-- Visibility for CL_ADMIN/CL_USER is now derived via the operational junction
-- (`appointment_contacts → appointments.tenant_id`). Standalone contacts
-- (created by AM/OP without an appointment context) carry `tenant_id = null`.
-- Email/phone uniqueness becomes global (cross-tenant); existing per-tenant
-- partial unique indexes are dropped and replaced by global ones.
--
-- Pre-deploy operational requirement: run
--   pnpm --filter backend exec tsx prisma/scripts/024-pre-migration-dedup-check.ts
-- and resolve any reported collisions BEFORE applying this migration.

-- 1) Dedup guard. If any collision exists across the (now-global) email or
--    phone scope, abort the migration loudly so two tenants' rows are not
--    silently merged into the new global unique constraint.
DO $$
DECLARE
  email_dups bigint;
  phone_dups bigint;
BEGIN
  SELECT count(*) INTO email_dups FROM (
    SELECT primary_email FROM contacts
    WHERE is_active = true AND primary_email IS NOT NULL
    GROUP BY primary_email HAVING count(*) > 1
  ) sub;

  SELECT count(*) INTO phone_dups FROM (
    SELECT primary_phone FROM contacts
    WHERE is_active = true AND primary_phone IS NOT NULL
    GROUP BY primary_phone HAVING count(*) > 1
  ) sub;

  IF email_dups > 0 OR phone_dups > 0 THEN
    RAISE EXCEPTION
      'Cross-tenant dedup pre-check failed (% email collisions, % phone collisions). Run prisma/scripts/024-pre-migration-dedup-check.ts for the report and resolve manually before re-applying.',
      email_dups, phone_dups;
  END IF;
END $$;

-- 2) Make contacts.tenant_id nullable. Existing rows keep their values
--    (backfill safety — the visibility predicate OR-includes the legacy
--    tenant_id match alongside the EXISTS subquery).
ALTER TABLE "contacts" ALTER COLUMN "tenant_id" DROP NOT NULL;

-- 3) Swap per-tenant unique indexes for global ones. The previous indexes
--    enforced uniqueness within (tenant_id, primary_email) / (tenant_id,
--    primary_phone) and only over active rows; the new indexes enforce
--    uniqueness across ALL active rows regardless of tenant_id.
DROP INDEX IF EXISTS "contacts_tenant_email_active_unique";
DROP INDEX IF EXISTS "contacts_tenant_phone_active_unique";

CREATE UNIQUE INDEX "contacts_email_active_unique"
  ON "contacts" ("primary_email")
  WHERE "is_active" = true AND "primary_email" IS NOT NULL;

CREATE UNIQUE INDEX "contacts_phone_active_unique"
  ON "contacts" ("primary_phone")
  WHERE "is_active" = true AND "primary_phone" IS NOT NULL;
