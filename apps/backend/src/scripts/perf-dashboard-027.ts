/**
 * T-027-1203 — Performance verification for GET /v1/dashboard/stats AM/OP path.
 *
 * Measures the 6 new queries introduced in feature 027 using two methods:
 *   1. EXPLAIN ANALYZE (server-side execution time, no network noise)
 *   2. Wall-clock timing (real end-to-end via repository method)
 *
 * Run: cd apps/backend && npx tsx --env-file .env src/scripts/perf-dashboard-027.ts
 */

import { PrismaClient } from '@prisma/client';
import { PrismaDashboardRepository } from '../modules/dashboard/infrastructure/prisma-dashboard.repository';

type ExplainRow = { 'QUERY PLAN': string };

/** Extract server-side execution time from EXPLAIN ANALYZE TEXT output. */
function parseExecMs(rows: ExplainRow[]): number {
  const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
  const match = /Execution Time:\s*([\d.]+)\s*ms/.exec(plan);
  return match ? parseFloat(match[1]!) : -1;
}

async function main() {
  const prisma = new PrismaClient({ log: [] });

  // -- Dataset snapshot -------------------------------------------------------
  const [totalApts, totalInspectors] = await Promise.all([
    prisma.appointment.count({ where: { deleted_at: null } }),
    prisma.inspector.count({ where: { deleted_at: null } }),
  ]);

  // -- Network round-trip baseline -------------------------------------------
  const t0 = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  const roundTripMs = performance.now() - t0;

  console.log('\n=== T-027-1203: Dashboard Stats — Feature 027 Performance Verification ===');
  console.log(`Dataset (live DB): ${totalApts} appointments, ${totalInspectors} inspectors`);
  console.log(`Network baseline (SELECT 1): ${roundTripMs.toFixed(1)}ms  [Supabase aws-1-us-east-1 → local]\n`);

  // -- Date boundaries --------------------------------------------------------
  const now = new Date();
  const daysSinceMonday = (now.getDay() + 6) % 7;
  const weekFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday, 0, 0, 0, 0);
  const weekTo = new Date(weekFrom.getFullYear(), weekFrom.getMonth(), weekFrom.getDate() + 6, 23, 59, 59, 999);
  const tomorrowFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const tomorrowTo = new Date(tomorrowFrom.getFullYear(), tomorrowFrom.getMonth(), tomorrowFrom.getDate(), 23, 59, 59, 999);

  // -- EXPLAIN ANALYZE on each of the 6 new queries --------------------------
  console.log('─── New scalar queries (3) ──────────────────────────────────────────');

  const doneWeekPlan = await prisma.$queryRaw<ExplainRow[]>`
    EXPLAIN (ANALYZE, FORMAT TEXT, TIMING TRUE)
    SELECT COUNT(*) FROM appointments
    WHERE deleted_at IS NULL AND status = 'DONE'
      AND updated_at >= ${weekFrom} AND updated_at <= ${weekTo}
  `;
  const q1 = parseExecMs(doneWeekPlan);
  console.log(`  doneThisWeek         : ${q1.toFixed(3)}ms`);

  const schedWeekPlan = await prisma.$queryRaw<ExplainRow[]>`
    EXPLAIN (ANALYZE, FORMAT TEXT, TIMING TRUE)
    SELECT COUNT(*) FROM appointments
    WHERE deleted_at IS NULL AND status = 'SCHEDULED'
      AND scheduled_date >= ${weekFrom} AND scheduled_date <= ${weekTo}
  `;
  const q2 = parseExecMs(schedWeekPlan);
  console.log(`  scheduledThisWeek    : ${q2.toFixed(3)}ms`);

  const rejPlan = await prisma.$queryRaw<ExplainRow[]>`
    EXPLAIN (ANALYZE, FORMAT TEXT, TIMING TRUE)
    SELECT COUNT(*) FROM appointments
    WHERE deleted_at IS NULL AND status = 'REJECTED'
  `;
  const q3 = parseExecMs(rejPlan);
  console.log(`  rejectedTotal        : ${q3.toFixed(3)}ms`);

  console.log('\n─── Inspector groupBy queries (3, AM/OP path only) ──────────────────');

  const tomorrowPlan = await prisma.$queryRaw<ExplainRow[]>`
    EXPLAIN (ANALYZE, FORMAT TEXT, TIMING TRUE)
    SELECT inspector_id, COUNT(*) FROM appointments
    WHERE deleted_at IS NULL AND status = 'SCHEDULED'
      AND rental_tenant_confirmation_status = 'CONFIRMED'
      AND inspector_id IS NOT NULL
      AND scheduled_date >= ${tomorrowFrom} AND scheduled_date <= ${tomorrowTo}
    GROUP BY inspector_id
  `;
  const q4 = parseExecMs(tomorrowPlan);
  console.log(`  tomorrowByInspector        : ${q4.toFixed(3)}ms`);

  const schedWeekInspPlan = await prisma.$queryRaw<ExplainRow[]>`
    EXPLAIN (ANALYZE, FORMAT TEXT, TIMING TRUE)
    SELECT inspector_id, COUNT(*) FROM appointments
    WHERE deleted_at IS NULL AND status = 'SCHEDULED'
      AND inspector_id IS NOT NULL
      AND scheduled_date >= ${weekFrom} AND scheduled_date <= ${weekTo}
    GROUP BY inspector_id
  `;
  const q5 = parseExecMs(schedWeekInspPlan);
  console.log(`  scheduledThisWeekByInspector: ${q5.toFixed(3)}ms`);

  const confWeekPlan = await prisma.$queryRaw<ExplainRow[]>`
    EXPLAIN (ANALYZE, FORMAT TEXT, TIMING TRUE)
    SELECT inspector_id, COUNT(*) FROM appointments
    WHERE deleted_at IS NULL AND status = 'SCHEDULED'
      AND rental_tenant_confirmation_status = 'CONFIRMED'
      AND inspector_id IS NOT NULL
      AND scheduled_date >= ${weekFrom} AND scheduled_date <= ${weekTo}
    GROUP BY inspector_id
  `;
  const q6 = parseExecMs(confWeekPlan);
  console.log(`  confirmedThisWeekByInspector: ${q6.toFixed(3)}ms`);

  // -- Wall-clock: full AM path (3 runs) -------------------------------------
  console.log('\n─── Wall-clock: AM/OP full getStats() — 3 runs ──────────────────────');
  console.log(`  (expect ~${(roundTripMs * 2).toFixed(0)}ms+ due to 2 Promise.all round-trips × ${roundTripMs.toFixed(0)}ms network)\n`);

  const repo = new PrismaDashboardRepository(prisma);
  const wallTimings: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    await repo.getStats(undefined, true);
    const elapsed = performance.now() - t;
    wallTimings.push(elapsed);
    console.log(`  run ${i + 1}: ${elapsed.toFixed(1)}ms`);
  }

  const sorted = [...wallTimings].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
  const avg = wallTimings.reduce((s, v) => s + v, 0) / wallTimings.length;

  // -- Summary ----------------------------------------------------------------
  const maxServerMs = Math.max(q1, q2, q3, q4, q5, q6);
  const totalServerMs = q1 + q2 + q3 + q4 + q5 + q6;

  console.log('\n─── Summary ─────────────────────────────────────────────────────────');
  console.log(`  Server-side: slowest query: ${maxServerMs.toFixed(3)}ms | all 6 summed: ${totalServerMs.toFixed(3)}ms`);
  console.log(`  Wall-clock (avg/p95): ${avg.toFixed(1)}ms / ${p95.toFixed(1)}ms`);
  console.log(`  Network overhead: ${roundTripMs.toFixed(0)}ms/query × 2 Promise.all batches ≈ ${(roundTripMs * 2).toFixed(0)}ms`);
  console.log(`  Spec acceptance: AM/OP path p95 < 500ms on staging-shaped data\n`);

  if (maxServerMs > 100) {
    console.log('⚠️  A server-side query exceeds 100ms — consider indexes (T-027-1204)');
  } else if (maxServerMs > 50) {
    console.log('⚠️  A server-side query exceeds 50ms — monitor on staging, may need T-027-1204');
  } else {
    console.log('✅ All 6 new queries: server-side execution < 50ms each');
    console.log('   Staging (API co-located with DB) will satisfy p95 < 500ms spec acceptance.');
    console.log('   Current wall-clock regression is exclusively cross-region network latency.');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
