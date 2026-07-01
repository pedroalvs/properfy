/*
  Warnings:

  - You are about to drop the column `regions_json` on the `inspectors` table. All the data in the column will be lost.

  Contract phase (expand/contract): `inspectors.regions_json` was a
  denormalized cache; the `inspector_regions` junction table is authoritative
  for all region assignment and the Inspector entity never exposed this column.
*/
-- AlterTable
ALTER TABLE "inspectors" DROP COLUMN "regions_json";
