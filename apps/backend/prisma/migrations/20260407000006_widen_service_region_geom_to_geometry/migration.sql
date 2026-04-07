-- Widen geom column from Polygon to generic Geometry to support MultiPolygon and holes
ALTER TABLE "service_regions" ALTER COLUMN "geom" TYPE geometry(Geometry, 4326);
