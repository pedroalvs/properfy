/**
 * T-027-1203 — Perf seed: creates ≥10 active inspectors and ≥200 appointments
 * in the live DB so the performance script runs on a representative dataset.
 *
 * Idempotent: uses createMany(skipDuplicates) and upsert — safe to re-run.
 * All created records use a "perf027-" prefix in identifiers so they are easy to identify.
 *
 * Run: cd apps/backend && npx tsx --env-file .env src/scripts/seed-perf-027.ts
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient({ log: [] });

// ─── Existing entities (verified present in live DB) ─────────────────────────

const TENANT_ID = '8d39f531-0dd5-4a4f-af33-c470a1432cad';
const BRANCH_ID = 'ea6b349b-c656-4a8e-8195-2b5dbe3c91d6';
const SERVICE_TYPE_ID = '40000000-0000-0000-0000-000000000001'; // ROUTINE
const CREATED_BY_USER_ID = '1c629351-0649-4d6f-9625-82f75f25a862'; // AM user

// Existing active inspectors
const EXISTING_INSPECTORS = [
  '30000000-0000-0000-0000-000000000002',
  'bc7665b0-f3a7-4423-9e80-b3b138c290a5',
  '563f1a8f-bf27-4ed9-b714-a20e7899e826',
  'e278a39b-b58e-45dc-b932-249ab31ba8d3',
  '1fabf31e-2d4b-4826-9105-28a26f9b722a',
  '1d86669b-9924-4141-9962-9a8d9c7c8f38',
];

// 4 new inspectors to reach ≥10
// IDs use hex-only chars (fefe0270 prefix) so they pass z.string().uuid() validation.
const NEW_INSPECTORS = [
  { id: 'fefe0270-0000-4000-8000-000000000001', name: 'Perf Inspector 07', email: 'perf.insp07@perf027.test' },
  { id: 'fefe0270-0000-4000-8000-000000000002', name: 'Perf Inspector 08', email: 'perf.insp08@perf027.test' },
  { id: 'fefe0270-0000-4000-8000-000000000003', name: 'Perf Inspector 09', email: 'perf.insp09@perf027.test' },
  { id: 'fefe0270-0000-4000-8000-000000000004', name: 'Perf Inspector 10', email: 'perf.insp10@perf027.test' },
];

const ALL_INSPECTORS = [...EXISTING_INSPECTORS, ...NEW_INSPECTORS.map((i) => i.id)];

// Existing properties (tenant-scoped)
const PROPERTIES = [
  '0113a740-9d2f-4f32-9539-44a9c54e7587',
  '1ff11f8e-ae55-4480-b8e9-61128baf9cf0',
  '55875f13-77af-4727-8e64-b0b39c3dd170',
  '6db7c3b5-56c7-4d39-aebd-4bd41f80be6e',
  '87da8eb8-a071-4299-b0ce-a9a1eec8550a',
  'ca17f2e6-15d4-4c1e-82ba-666ecfafd947',
  'dbb23b61-ed7a-4dea-a18d-48048272ce00',
  'e41c259b-d19c-44ae-bd47-d3bb06bee52a',
  'f68c3ebd-d0f4-4dfd-ab1b-fb28f2ee63ab',
];

function pickRoundRobin<T>(arr: T[], index: number): T {
  return arr[index % arr.length]!;
}

/** Date offset from today (server-local). offset=0 is today, offset=1 is tomorrow, offset=-7 is last week. */
function offsetDate(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()); // midnight local
}

/** Monday of the current week (server-local). */
function thisWeekMonday(): Date {
  const now = new Date();
  const daysSinceMonday = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
}

async function main() {
  console.log('\n=== seed-perf-027: seeding representative perf dataset ===\n');

  // -- Step 1: upsert 4 new inspectors ----------------------------------------
  console.log('Creating 4 new perf inspectors...');
  for (const insp of NEW_INSPECTORS) {
    await prisma.inspector.upsert({
      where: { id: insp.id },
      update: {},
      create: {
        id: insp.id,
        name: insp.name,
        email: insp.email,
        status: 'ACTIVE',
        payment_settings_json: {},
        service_types_json: [],
        client_eligibility_json: [],
        blocked_clients_json: [],
      },
    });
  }
  console.log('  ✓ Inspectors upserted');

  // -- Step 2: build 200+ appointment records ----------------------------------
  console.log('Building 200+ appointment records...');

  const monday = thisWeekMonday();
  const appointments: Prisma.AppointmentCreateManyInput[] = [];

  let idx = 0;

  const snap = { type: 'FIXED', fixed_amount: '150.00' };

  // Helper to build a record
  const apt = (
    i: number,
    status: string,
    scheduledOffset: number,
    inspectorIdx: number | null,
    confirmStatus: string,
    updatedAtOverride?: Date,
  ) => ({
    id: `fefe0270-0000-4000-8${String(i).padStart(3, '0')}-${String(i).padStart(12, '0')}`,
    tenant_id: TENANT_ID,
    branch_id: BRANCH_ID,
    property_id: pickRoundRobin(PROPERTIES, i),
    service_type_id: SERVICE_TYPE_ID,
    inspector_id: inspectorIdx !== null ? pickRoundRobin(ALL_INSPECTORS, inspectorIdx + i) : null,
    status: status as any,
    scheduled_date: offsetDate(scheduledOffset),
    time_slot_start: '09:00',
    time_slot_end: '12:00',
    key_required: false,
    rental_tenant_confirmation_status: confirmStatus as any,
    price_amount: new Prisma.Decimal('150.00'),
    payout_amount: new Prisma.Decimal('100.00'),
    pricing_rule_snapshot_json: snap,
    created_by_user_id: CREATED_BY_USER_ID,
    ...(updatedAtOverride ? { updated_at: updatedAtOverride } : {}),
  });

  // TOMORROW — SCHEDULED + CONFIRMED (for tomorrowByInspector): 20 records
  for (let i = 0; i < 20; i++) {
    appointments.push(apt(idx++, 'SCHEDULED', 1, i % 10, 'CONFIRMED'));
  }

  // THIS WEEK — SCHEDULED various days (Mon–Sun): 40 records
  for (let i = 0; i < 40; i++) {
    const dayOffset = (i % 7) - (new Date().getDay() + 6) % 7; // distribute within week
    appointments.push(apt(idx++, 'SCHEDULED', dayOffset, i % 10, i % 3 === 0 ? 'CONFIRMED' : 'PENDING'));
  }

  // THIS WEEK — DONE (updated this week): 30 records
  for (let i = 0; i < 30; i++) {
    const dayOffset = -((i % 5) + 1); // Mon–Fri of current week (negative for past days)
    const doneApt = apt(idx++, 'DONE', dayOffset, i % 10, 'CONFIRMED');
    // Ensure updated_at is within this week
    const updatedAt = new Date(monday);
    updatedAt.setDate(monday.getDate() + (i % 5));
    appointments.push({ ...doneApt, updated_at: updatedAt } as any);
  }

  // THIS MONTH — DONE (earlier in month): 30 records
  for (let i = 0; i < 30; i++) {
    const dayOffset = -(7 + (i % 14)); // 7–20 days ago
    appointments.push(apt(idx++, 'DONE', dayOffset, i % 10, 'CONFIRMED'));
  }

  // REJECTED (all-time): 30 records
  for (let i = 0; i < 30; i++) {
    appointments.push(apt(idx++, 'REJECTED', -(i + 1), null, 'PENDING'));
  }

  // DRAFT: 30 records
  for (let i = 0; i < 30; i++) {
    appointments.push(apt(idx++, 'DRAFT', i + 2, null, 'PENDING'));
  }

  // PAST SCHEDULED (prior weeks): 30 records
  for (let i = 0; i < 30; i++) {
    appointments.push(apt(idx++, 'SCHEDULED', -(14 + i), i % 10, 'CONFIRMED'));
  }

  console.log(`  Total records to seed: ${appointments.length}`);

  // createMany with skipDuplicates = idempotent
  const result = await prisma.appointment.createMany({
    data: appointments as any,
    skipDuplicates: true,
  });

  console.log(`  ✓ Inserted ${result.count} new appointments (${appointments.length - result.count} already existed)\n`);

  // -- Final counts -----------------------------------------------------------
  const [totalApts, totalInsp] = await Promise.all([
    prisma.appointment.count({ where: { deleted_at: null } }),
    prisma.inspector.count({ where: { status: 'ACTIVE', deleted_at: null } }),
  ]);

  console.log(`Dataset after seed: ${totalApts} appointments, ${totalInsp} active inspectors`);

  if (totalApts < 200) {
    console.warn(`⚠️  Still under 200 appointments (${totalApts}) — re-run may be needed`);
  }
  if (totalInsp < 10) {
    console.warn(`⚠️  Still under 10 inspectors (${totalInsp})`);
  }

  if (totalApts >= 200 && totalInsp >= 10) {
    console.log('✅ Dataset meets T-027-1203 minimum requirements');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
