-- Permanent geocoding markers (X02-1). Expand-only: three nullable columns,
-- no backfill, no contract, no long lock. Does not touch the PostGIS
-- `coordinates` column or its GIST index.

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "geocoded_permanently_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "geocoded_permanently_at" TIMESTAMP(3),
ADD COLUMN     "geocoding_failure_code" VARCHAR(64);
