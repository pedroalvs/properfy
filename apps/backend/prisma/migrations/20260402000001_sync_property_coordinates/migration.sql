-- Sync PostGIS coordinates for all properties that have lat/lng but missing PostGIS coordinates.
-- This catches properties where geocoding succeeded (lat/lng set) but the PostGIS column
-- was not synced due to a code path gap or migration timing.
UPDATE properties
SET coordinates = ST_SetSRID(ST_Point(lng::float, lat::float), 4326)
WHERE lat IS NOT NULL
  AND lng IS NOT NULL
  AND coordinates IS NULL;
