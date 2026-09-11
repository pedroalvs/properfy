-- Case-insensitive uniqueness for service region names within a tenant scope.
--
-- The model-level @@unique([tenant_id, name]) is case-sensitive, while the app
-- uniqueness check (findByName) is case-insensitive. Two concurrent case-variant
-- writes ("North Shore" / "north shore") therefore bypass the app check and
-- surface as an untranslated error. This functional unique index closes that
-- race at the database (#614).
--
-- Prisma cannot express an index over lower(name), so it is managed here in raw
-- SQL and documented with a schema comment on model ServiceRegion. Do NOT let a
-- later `migrate dev` drop it (see project_prisma_drift_drops_unsupported_indexes).
--
-- NULL tenant_id (global regions) keeps the same NULLs-are-distinct semantics as
-- the existing @@unique, so global regions still rely on the app-level check.
--
-- PRE-CHECK BEFORE APPLYING TO STAGING/PROD — this index creation FAILS if any
-- tenant already holds case-variant duplicate names. Run first and resolve any
-- hits (a product decision — do not auto-rename):
--   SELECT tenant_id, lower(name) AS n, count(*)
--   FROM service_regions
--   GROUP BY tenant_id, lower(name)
--   HAVING count(*) > 1;

CREATE UNIQUE INDEX "service_regions_tenant_lower_name_key"
  ON "service_regions" ("tenant_id", lower("name"));
