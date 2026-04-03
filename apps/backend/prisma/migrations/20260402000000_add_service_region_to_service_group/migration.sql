-- AlterTable
ALTER TABLE "service_groups" ADD COLUMN "service_region_id" TEXT;

-- CreateIndex
CREATE INDEX "service_groups_service_region_id_idx" ON "service_groups"("service_region_id");

-- AddForeignKey
ALTER TABLE "service_groups" ADD CONSTRAINT "service_groups_service_region_id_fkey" FOREIGN KEY ("service_region_id") REFERENCES "service_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
