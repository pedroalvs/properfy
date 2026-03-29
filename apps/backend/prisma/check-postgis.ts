import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const result = await prisma.$queryRawUnsafe('SELECT PostGIS_Version() as version');
    console.log('PostGIS ENABLED:', JSON.stringify(result));
  } catch {
    console.log('PostGIS NOT ENABLED — needs to be enabled in Supabase dashboard');
    // Try enabling it
    try {
      await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS postgis');
      console.log('PostGIS ENABLED SUCCESSFULLY');
      const result2 = await prisma.$queryRawUnsafe('SELECT PostGIS_Version() as version');
      console.log('Version:', JSON.stringify(result2));
    } catch (e) {
      console.log('Failed to enable PostGIS:', (e as Error).message);
    }
  }
  await prisma.$disconnect();
}

main();
