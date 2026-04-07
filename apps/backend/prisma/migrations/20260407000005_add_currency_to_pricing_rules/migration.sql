-- AlterTable: add currency column to service_price_rules (nullable first for backfill)
ALTER TABLE "service_price_rules" ADD COLUMN "currency" VARCHAR(3);

-- Backfill existing rows from tenant's currency
UPDATE "service_price_rules" spr
SET "currency" = t."currency"
FROM "tenants" t
WHERE t."id" = spr."tenant_id"
  AND spr."currency" IS NULL;

-- Set NOT NULL after backfill
ALTER TABLE "service_price_rules" ALTER COLUMN "currency" SET NOT NULL;
