import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Delete the failed migration record so it can be re-applied
  await prisma.$executeRawUnsafe(
    `DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260329200000_postgis_polygon_regions'`
  );
  console.log('Deleted migration record');

  await prisma.$disconnect();
}

main().catch(console.error);
