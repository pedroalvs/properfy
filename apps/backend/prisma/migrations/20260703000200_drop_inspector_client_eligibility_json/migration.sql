/*
  Warnings:

  - You are about to drop the column `client_eligibility_json` on the `inspectors` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "inspectors" DROP COLUMN "client_eligibility_json";
