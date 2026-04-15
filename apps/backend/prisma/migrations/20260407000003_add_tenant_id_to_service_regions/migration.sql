-- Phase 1 (expand): Add nullable tenant_id column
ALTER TABLE "service_regions" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;

-- Phase 2 (backfill): Derive tenant_id from related entities.
-- Primary: service_groups that reference this region → use the group's tenant_id.
UPDATE "service_regions" sr
SET "tenant_id" = (
  SELECT sg."tenant_id"
  FROM "service_groups" sg
  WHERE sg."service_region_id" = sr."id"
  LIMIT 1
)
WHERE sr."tenant_id" IS NULL;

-- Secondary: for regions not linked to any service group, derive via creator user.
UPDATE "service_regions" sr
SET "tenant_id" = (
  SELECT u."tenant_id"
  FROM "users" u
  WHERE u."id" = sr."created_by_user_id"
    AND u."tenant_id" IS NOT NULL
  LIMIT 1
)
WHERE sr."tenant_id" IS NULL
  AND sr."created_by_user_id" IS NOT NULL;

-- Safety check: fail explicitly if any rows remain without a derivable tenant_id.
-- This prevents silently creating orphaned data with NULL tenant ownership.
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM "service_regions"
  WHERE "tenant_id" IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION BLOCKED: % service_regions row(s) have NULL tenant_id after backfill. These rows have no service_group reference and no created_by_user with a tenant. Manual assignment required before this migration can proceed.', orphan_count;
  END IF;
END $$;

-- Phase 3 (contract): Now safe to set NOT NULL — all rows have tenant_id.
ALTER TABLE "service_regions" ALTER COLUMN "tenant_id" SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE "service_regions"
  ADD CONSTRAINT "service_regions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop old unique constraint on name (if it exists)
DROP INDEX IF EXISTS "service_regions_name_key";

-- Add composite unique constraint (tenant_id, name)
CREATE UNIQUE INDEX "service_regions_tenant_id_name_key" ON "service_regions"("tenant_id", "name");

-- Add index on tenant_id for efficient scoped queries
CREATE INDEX "service_regions_tenant_id_idx" ON "service_regions"("tenant_id");
