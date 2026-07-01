-- Complete the RentalTenant rename: the occupant FK column on the portal-activity
-- tables was the last code-visible `tenant_portal_*` identifier. Rename it to match
-- the schema. Internal index/constraint names (Postgres artifacts, not referenced by
-- code or the Prisma schema) intentionally retain their original names.
ALTER TABLE "rental_tenant_portal_activities" RENAME COLUMN "tenant_portal_token_id" TO "rental_tenant_portal_token_id";
ALTER TABLE "rental_tenant_portal_activities_archive" RENAME COLUMN "tenant_portal_token_id" TO "rental_tenant_portal_token_id";
