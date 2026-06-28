/*
  Warnings:

  - You are about to drop the column `regions_json` on the `inspectors` table. All the data in the column will be lost.
  - You are about to drop the column `delivery_email` on the `scheduled_reports` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `scheduled_reports` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "scheduled_reports_is_active_next_run_at_idx";

-- AlterTable
ALTER TABLE "inspectors" DROP COLUMN "regions_json";

-- AlterTable
ALTER TABLE "scheduled_reports" DROP COLUMN "delivery_email",
DROP COLUMN "is_active";
