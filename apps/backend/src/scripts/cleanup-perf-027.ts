/**
 * Cleanup for T-027-1203 perf seed — removes records inserted by seed-perf-027.ts
 * that have non-UUID IDs (fefe0270-* prefix), causing ResponseValidationError 500s.
 *
 * Safe to run multiple times (idempotent — deletes by known prefix).
 *
 * Run: cd apps/backend && npx tsx --env-file .env src/scripts/cleanup-perf-027.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: [] });

async function main() {
  console.log('\n=== cleanup-perf-027: removing invalid perf seed records ===\n');

  // Count before
  const [aptBefore, inspBefore] = await Promise.all([
    prisma.appointment.count({ where: { id: { startsWith: 'fefe0270' } } }),
    prisma.inspector.count({ where: { id: { startsWith: 'fefe0270' } } }),
  ]);

  console.log(`Records to delete: ${aptBefore} appointments, ${inspBefore} inspectors`);

  if (aptBefore === 0 && inspBefore === 0) {
    console.log('✅ Nothing to clean up — DB is already clean.');
    return;
  }

  // Delete appointments first (FK may reference inspectors)
  const deletedApts = await prisma.appointment.deleteMany({
    where: { id: { startsWith: 'fefe0270' } },
  });
  console.log(`  ✓ Deleted ${deletedApts.count} appointments`);

  // Delete inspectors
  const deletedInsp = await prisma.inspector.deleteMany({
    where: { id: { startsWith: 'fefe0270' } },
  });
  console.log(`  ✓ Deleted ${deletedInsp.count} inspectors`);

  // Verify
  const [aptAfter, inspAfter] = await Promise.all([
    prisma.appointment.count({ where: { id: { startsWith: 'fefe0270' } } }),
    prisma.inspector.count({ where: { id: { startsWith: 'fefe0270' } } }),
  ]);

  if (aptAfter === 0 && inspAfter === 0) {
    console.log('\n✅ Cleanup complete — all fefe0270 records removed.');
  } else {
    console.error(`\n❌ Cleanup incomplete: ${aptAfter} appointments and ${inspAfter} inspectors remain.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
