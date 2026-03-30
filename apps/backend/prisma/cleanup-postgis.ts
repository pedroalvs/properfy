import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up partial PostGIS migration...');

  // Drop any partially created objects
  const cleanupStatements = [
    'DROP TABLE IF EXISTS "inspector_regions" CASCADE',
    'DROP INDEX IF EXISTS "service_regions_geom_idx"',
    'DROP INDEX IF EXISTS "properties_coordinates_idx"',
    'ALTER TABLE "service_regions" DROP COLUMN IF EXISTS "geom"',
    'ALTER TABLE "service_regions" DROP COLUMN IF EXISTS "geojson"',
    'ALTER TABLE "service_regions" DROP COLUMN IF EXISTS "color"',
    'ALTER TABLE "service_regions" DROP COLUMN IF EXISTS "created_by_user_id"',
    'ALTER TABLE "properties" DROP COLUMN IF EXISTS "coordinates"',
  ];

  for (const sql of cleanupStatements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('OK:', sql);
    } catch (e) {
      console.log('SKIP:', sql, '-', (e as Error).message);
    }
  }

  console.log('Cleanup done.');
  await prisma.$disconnect();
}

main().catch(console.error);
