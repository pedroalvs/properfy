-- CreateEnum
CREATE TYPE "RegionStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SuburbStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "suburbs" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "city" VARCHAR(150) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "country" VARCHAR(10) NOT NULL,
    "postcode" VARCHAR(20),
    "status" "SuburbStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suburbs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_regions" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "country" VARCHAR(10) NOT NULL,
    "status" "RegionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region_suburbs" (
    "region_id" TEXT NOT NULL,
    "suburb_id" TEXT NOT NULL,

    CONSTRAINT "region_suburbs_pkey" PRIMARY KEY ("region_id","suburb_id")
);

-- CreateTable
CREATE TABLE "inspector_service_regions" (
    "inspector_id" TEXT NOT NULL,
    "region_id" TEXT NOT NULL,

    CONSTRAINT "inspector_service_regions_pkey" PRIMARY KEY ("inspector_id","region_id")
);

-- AlterTable
ALTER TABLE "properties" ADD COLUMN "suburb_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "suburbs_name_city_state_country_key" ON "suburbs"("name", "city", "state", "country");

-- CreateIndex
CREATE INDEX "suburbs_city_state_country_idx" ON "suburbs"("city", "state", "country");

-- CreateIndex
CREATE INDEX "suburbs_country_idx" ON "suburbs"("country");

-- CreateIndex
CREATE INDEX "suburbs_status_idx" ON "suburbs"("status");

-- CreateIndex
CREATE INDEX "service_regions_status_idx" ON "service_regions"("status");

-- CreateIndex
CREATE INDEX "service_regions_country_state_idx" ON "service_regions"("country", "state");

-- CreateIndex
CREATE INDEX "region_suburbs_suburb_id_idx" ON "region_suburbs"("suburb_id");

-- CreateIndex
CREATE INDEX "inspector_service_regions_region_id_idx" ON "inspector_service_regions"("region_id");

-- CreateIndex
CREATE INDEX "properties_suburb_id_idx" ON "properties"("suburb_id");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_suburb_id_fkey" FOREIGN KEY ("suburb_id") REFERENCES "suburbs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "region_suburbs" ADD CONSTRAINT "region_suburbs_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "service_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "region_suburbs" ADD CONSTRAINT "region_suburbs_suburb_id_fkey" FOREIGN KEY ("suburb_id") REFERENCES "suburbs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_service_regions" ADD CONSTRAINT "inspector_service_regions_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_service_regions" ADD CONSTRAINT "inspector_service_regions_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "service_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
