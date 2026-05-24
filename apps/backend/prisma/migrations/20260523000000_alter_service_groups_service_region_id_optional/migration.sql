-- 026 BUG-004: service_region_id is optional at creation (spec 005 FR-007).
-- Required only at publish (SERVICE_REGION_REQUIRED validation in publish use case).
ALTER TABLE "service_groups" ALTER COLUMN "service_region_id" DROP NOT NULL;
