-- Backfill geom from geojson for existing rows
UPDATE service_regions
SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geojson::text), 4326)
WHERE geojson IS NOT NULL AND geom IS NULL;

-- Add GIST index for spatial queries
CREATE INDEX IF NOT EXISTS "service_regions_geom_gist_idx" ON "service_regions" USING GIST ("geom");
