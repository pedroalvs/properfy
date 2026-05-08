-- AlterTable: make service_regions.tenant_id nullable (global regions for AM)
ALTER TABLE "service_regions" ALTER COLUMN "tenant_id" DROP NOT NULL;
