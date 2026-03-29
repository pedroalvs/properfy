-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Drop suburb-based junction tables
DROP TABLE IF EXISTS "inspector_service_regions" CASCADE;
DROP TABLE IF EXISTS "region_suburbs" CASCADE;

-- Drop suburb table
DROP TABLE IF EXISTS "suburbs" CASCADE;

-- Drop suburb enums if they exist
DROP TYPE IF EXISTS "SuburbStatus" CASCADE;

-- Remove suburb_id from properties
ALTER TABLE "properties" DROP COLUMN IF EXISTS "suburb_id";

-- Add polygon columns to service_regions
ALTER TABLE "service_regions" ADD COLUMN IF NOT EXISTS "geom" GEOMETRY(Polygon, 4326);
ALTER TABLE "service_regions" ADD COLUMN IF NOT EXISTS "geojson" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "service_regions" ADD COLUMN IF NOT EXISTS "color" VARCHAR(20) DEFAULT '#3b82f6';
ALTER TABLE "service_regions" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID REFERENCES "users"("id");

-- Drop old columns from service_regions
ALTER TABLE "service_regions" DROP COLUMN IF EXISTS "state";
ALTER TABLE "service_regions" DROP COLUMN IF EXISTS "country";

-- Create spatial index
CREATE INDEX IF NOT EXISTS "service_regions_geom_idx" ON "service_regions" USING GIST("geom");

-- Create inspector_regions junction table
CREATE TABLE IF NOT EXISTS "inspector_regions" (
  "inspector_id" UUID NOT NULL REFERENCES "inspectors"("id") ON DELETE CASCADE,
  "region_id" UUID NOT NULL REFERENCES "service_regions"("id") ON DELETE CASCADE,
  "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "assigned_by" UUID REFERENCES "users"("id"),
  PRIMARY KEY ("inspector_id", "region_id")
);
CREATE INDEX IF NOT EXISTS "inspector_regions_region_idx" ON "inspector_regions"("region_id");

-- Add geometry point column to properties
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "coordinates" GEOMETRY(Point, 4326);

-- Backfill coordinates from existing lat/lng
UPDATE "properties" SET "coordinates" = ST_SetSRID(ST_Point("lng"::float, "lat"::float), 4326) WHERE "lat" IS NOT NULL AND "lng" IS NOT NULL AND "coordinates" IS NULL;

-- Create spatial index on properties
CREATE INDEX IF NOT EXISTS "properties_coordinates_idx" ON "properties" USING GIST("coordinates");
