-- Recreates the contact-search trigram index dropped by
-- 20260601120000_email_assets_image_bindings (line 47), the same drift migration
-- that took the two PostGIS GIST indexes restored in 20260731090000.
--
-- Same root cause: Prisma cannot express an operator-class index
-- (`gin_trgm_ops`) in schema.prisma, so `migrate dev` read it as drift and
-- emitted DROP INDEX alongside unrelated work.
--
-- Why it matters: PrismaContactRepository.search() ranks with
-- `similarity(display_name, $q)` and filters with the `%` trigram operator. With
-- no index every contact search seq-scans `contacts`, computing similarity per
-- row — and the contact registry is cross-tenant, so it is the whole table.
--
-- Kept in its own migration rather than appended to 20260731090000: that file is
-- already applied in CI and local databases, and editing it would change its
-- checksum and fail `migrate deploy` with drift.
--
-- pg_trgm is created by 20260413100000_add_contacts_registry; the IF NOT EXISTS
-- keeps this runnable on a database where that never ran.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "contacts_display_name_trgm_idx"
  ON "contacts" USING gin ("display_name" gin_trgm_ops);
