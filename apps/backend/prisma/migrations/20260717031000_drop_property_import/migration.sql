/*
  Warnings:

  - You are about to drop the `property_imports` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "property_imports" DROP CONSTRAINT "property_imports_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "property_imports" DROP CONSTRAINT "property_imports_tenant_id_fkey";

-- DropTable
DROP TABLE "property_imports";
