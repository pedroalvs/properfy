-- AlterTable
ALTER TABLE "inspection_assets" ADD COLUMN IF NOT EXISTS "original_filename" VARCHAR(255);

-- AlterTable
ALTER TABLE "inspectors" ADD COLUMN IF NOT EXISTS "photo_storage_key" TEXT;
ALTER TABLE "inspectors" ADD COLUMN IF NOT EXISTS "insurance_meta_json" JSONB;
ALTER TABLE "inspectors" ADD COLUMN IF NOT EXISTS "police_check_meta_json" JSONB;
