/**
 * READ-ONLY dry run for the auto-cancel sweeps.
 *
 * Reports exactly what `appointment.cancel-overdue` and `service-group.cancel-empty`
 * WOULD act on, without writing anything. Deliberately read-only: both sweeps are
 * unscoped by tenant, so running the real thing against a shared database would
 * cancel every overdue appointment in it, not just a seeded fixture.
 *
 * Usage (from apps/backend, with a .env present):
 *   pnpm exec tsx --env-file=.env src/scripts/dry-run-auto-cancel.ts
 */
import { PrismaClient } from '@prisma/client';
import { isTerminalAppointmentStatus } from '@properfy/shared';
import { formatDate, startOfPlatformToday, PLATFORM_TIMEZONE } from '../shared/domain/timezone-date';
import { PrismaAppointmentRepository } from '../modules/appointment/infrastructure/prisma-appointment.repository';
import { CANCELLABLE_GROUP_STATUSES } from '../modules/service-group/application/services/cancel-empty-group.service';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const cutoff = startOfPlatformToday();
  console.log(`Platform timezone: ${PLATFORM_TIMEZONE}`);
  console.log(`Cutoff (UTC midnight of today's civil date): ${cutoff.toISOString()}\n`);

  // --- Sweep 1: overdue appointments -------------------------------------------
  // Reuse the production query rather than restating its filter, so this report
  // cannot drift from what the sweep actually does.
  const appointmentRepo = new PrismaAppointmentRepository(prisma);
  const overdue = await appointmentRepo.findOverdueActive(cutoff, Number.MAX_SAFE_INTEGER);

  const byStatus = overdue.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`WOULD CANCEL ${overdue.length} overdue appointment(s): ${JSON.stringify(byStatus)}`);
  if (overdue.length > 0) {
    const oldest = overdue[0]!;
    const newest = overdue[overdue.length - 1]!;
    console.log(`  date range: ${formatDate(oldest.scheduledDate)} .. ${formatDate(newest.scheduledDate)}`);
    console.log(`  distinct tenants: ${new Set(overdue.map((a) => a.tenantId)).size}`);
    console.log(`  in a service group: ${overdue.filter((a) => a.serviceGroupId).length}`);
  }

  // Sanity check: nothing dated today or later may appear.
  const wronglyIncluded = overdue.filter((a) => a.scheduledDate >= cutoff);
  console.log(`  dated today or later (must be 0): ${wronglyIncluded.length}\n`);

  // --- Sweep 2: released groups with nothing left ------------------------------
  const groups = await prisma.serviceGroup.findMany({
    where: { status: { in: [...CANCELLABLE_GROUP_STATUSES] } },
    select: {
      id: true, status: true, group_number: true,
      appointments: { where: { deleted_at: null }, select: { status: true } },
    },
  });

  const dead = groups.filter((g) => {
    const hasLive = g.appointments.some((a) => !isTerminalAppointmentStatus(a.status));
    const hasDone = g.appointments.some((a) => a.status === 'DONE');
    return !hasLive && !hasDone;
  });
  const skippedForDone = groups.filter((g) => {
    const hasLive = g.appointments.some((a) => !isTerminalAppointmentStatus(a.status));
    return !hasLive && g.appointments.some((a) => a.status === 'DONE');
  });

  console.log(`Released groups examined: ${groups.length}`);
  console.log(`WOULD CANCEL ${dead.length} group(s) with nothing left to execute`);
  for (const g of dead.slice(0, 20)) {
    console.log(`  #${g.group_number} (${g.status}) — ${g.appointments.length} linked member(s), none live, none DONE`);
  }
  if (dead.length > 20) console.log(`  ... and ${dead.length - 20} more`);
  console.log(`PROTECTED by the DONE rule (would be wrongly cancelled without it): ${skippedForDone.length}`);
  for (const g of skippedForDone.slice(0, 10)) {
    console.log(`  #${g.group_number} (${g.status}) — has a DONE member, left alone`);
  }

  console.log('\nNo writes performed.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
