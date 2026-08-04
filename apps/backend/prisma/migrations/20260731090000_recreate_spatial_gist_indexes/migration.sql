-- Recreates the PostGIS GIST indexes that migration
-- 20260601120000_email_assets_image_bindings dropped (lines 53-59).
--
-- Why they were lost: Prisma cannot represent an index over an
-- `Unsupported()` column in schema.prisma, so `prisma migrate dev` read both
-- indexes as drift and emitted DROP INDEX alongside the unrelated email-assets
-- work. Nothing recreated them, so every ST_Intersects in
-- resolveRegionsForAppointments / findPropertyIdsInInspectorRegions /
-- findContainingPoint has been a sequential scan over both sides of the join.
--
-- Note: 20260407000004 had also created "service_regions_geom_gist_idx", a
-- redundant second GIST index on the very same (service_regions, geom). Only
-- the canonical "service_regions_geom_idx" is restored here — recreating the
-- duplicate would just cost writes and disk for no read benefit.
--
-- Deliberately not CONCURRENTLY: `prisma migrate deploy` wraps each migration
-- file in a transaction, and CREATE INDEX CONCURRENTLY cannot run inside one.

CREATE INDEX IF NOT EXISTS "service_regions_geom_idx" ON "service_regions" USING GIST ("geom");

CREATE INDEX IF NOT EXISTS "properties_coordinates_idx" ON "properties" USING GIST ("coordinates");
