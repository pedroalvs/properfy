-- Phase 1 (expand): Add nullable tenant_id column with FK to tenants
ALTER TABLE "service_regions" ADD COLUMN "tenant_id" TEXT;

-- Add foreign key constraint
ALTER TABLE "service_regions"
  ADD CONSTRAINT "service_regions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 2 (backfill): Existing rows need manual tenant assignment.
-- Run the following before applying Phase 3 (contract):
--   UPDATE service_regions SET tenant_id = '<target_tenant_id>' WHERE tenant_id IS NULL;

-- Phase 3 (contract): Set NOT NULL after backfill is complete.
-- NOTE: In a fresh database (Supabase starts clean), there are no existing rows,
-- so we can safely set NOT NULL immediately.
ALTER TABLE "service_regions" ALTER COLUMN "tenant_id" SET NOT NULL;

-- Drop old unique constraint on name (if it exists)
-- The original schema had no explicit unique on name, so this is a no-op guard.
DROP INDEX IF EXISTS "service_regions_name_key";

-- Add composite unique constraint (tenant_id, name)
CREATE UNIQUE INDEX "service_regions_tenant_id_name_key" ON "service_regions"("tenant_id", "name");

-- Add index on tenant_id for efficient scoped queries
CREATE INDEX "service_regions_tenant_id_idx" ON "service_regions"("tenant_id");
