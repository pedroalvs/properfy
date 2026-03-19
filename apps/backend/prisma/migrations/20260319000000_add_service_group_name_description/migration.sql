-- AlterTable
ALTER TABLE "service_groups" ADD COLUMN "name" VARCHAR(255),
                             ADD COLUMN "region_name" VARCHAR(255),
                             ADD COLUMN "description" TEXT;
