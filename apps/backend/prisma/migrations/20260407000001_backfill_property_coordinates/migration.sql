-- Backfill PostGIS coordinates column from existing lat/lng values
UPDATE properties
SET coordinates = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
WHERE lat IS NOT NULL AND lng IS NOT NULL AND coordinates IS NULL;
