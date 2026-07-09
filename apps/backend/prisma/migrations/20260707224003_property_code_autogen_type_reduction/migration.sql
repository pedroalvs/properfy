-- Reduce PropertyType to APARTMENT/HOUSE, add per-tenant property_number
-- (backing auto-generated property codes) and apartment_number.

-- Map removed enum values to HOUSE before shrinking the enum.
UPDATE "properties" SET "type" = 'HOUSE' WHERE "type"::text IN ('COMMERCIAL', 'INDUSTRIAL', 'RURAL');

-- AlterEnum
BEGIN;
CREATE TYPE "PropertyType_new" AS ENUM ('APARTMENT', 'HOUSE');
ALTER TABLE "properties" ALTER COLUMN "type" TYPE "PropertyType_new" USING ("type"::text::"PropertyType_new");
ALTER TYPE "PropertyType" RENAME TO "PropertyType_old";
ALTER TYPE "PropertyType_new" RENAME TO "PropertyType";
DROP TYPE "PropertyType_old";
COMMIT;

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "apartment_number" VARCHAR(50),
ADD COLUMN     "property_number" INTEGER;

-- Backfill property_number per tenant (soft-deleted rows included so future
-- numbers never collide with historical ones).
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at, id) AS rn
  FROM "properties"
)
UPDATE "properties" p
SET "property_number" = numbered.rn
FROM numbered
WHERE p.id = numbered.id;

-- CreateIndex
CREATE UNIQUE INDEX "properties_tenant_id_property_number_key" ON "properties"("tenant_id", "property_number");
