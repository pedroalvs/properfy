-- Replace PropertyType enum: RESIDENTIAL is split into APARTMENT/HOUSE.
-- Existing rows are mapped RESIDENTIAL -> HOUSE (approved data migration).
CREATE TYPE "PropertyType_new" AS ENUM ('APARTMENT', 'HOUSE', 'COMMERCIAL', 'INDUSTRIAL', 'RURAL');
ALTER TABLE "properties"
  ALTER COLUMN "type" TYPE "PropertyType_new"
  USING (
    CASE WHEN "type"::text = 'RESIDENTIAL' THEN 'HOUSE' ELSE "type"::text END
  )::"PropertyType_new";
DROP TYPE "PropertyType";
ALTER TYPE "PropertyType_new" RENAME TO "PropertyType";

-- New optional property detail fields
ALTER TABLE "properties"
  ADD COLUMN "private_area_m2" DECIMAL(10,2),
  ADD COLUMN "total_area_m2" DECIMAL(10,2),
  ADD COLUMN "furnished" BOOLEAN,
  ADD COLUMN "linen_provided" BOOLEAN,
  ADD COLUMN "rent_amount" DECIMAL(12,2);
