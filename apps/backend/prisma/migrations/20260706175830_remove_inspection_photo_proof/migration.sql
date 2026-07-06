/*
  Warnings:

  - You are about to drop the `inspection_assets` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "inspection_assets" DROP CONSTRAINT "inspection_assets_appointment_id_fkey";

-- DropForeignKey
ALTER TABLE "inspection_assets" DROP CONSTRAINT "inspection_assets_inspection_execution_id_fkey";

-- DropTable
DROP TABLE "inspection_assets";

-- DropEnum
DROP TYPE "InspectionAssetKind";

-- DropEnum
DROP TYPE "InspectionAssetStatus";
