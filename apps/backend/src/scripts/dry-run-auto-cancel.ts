/**
 * READ-ONLY dry run for the auto-cancel sweeps.
 *
 * Reports exactly what `appointment.cancel-overdue` and `service-group.cancel-empty`
 * WOULD act on, without writing anything. Deliberately read-only: both sweeps are
 * unscoped by tenant, so running the real thing against a shared database would
 * cancel every overdue appointment in it, not just a seeded fixture.
 *
 * Usage — locally, from apps/backend with a .env present:
 *   pnpm exec tsx --env-file=.env src/scripts/dry-run-auto-cancel.ts
 *
 * Usage — against a deployed environment, without copying its credentials
 * anywhere (bundled into the image via the tsup entry map):
 *   fly ssh console -a properfy-prod -C \
 *     "cd /app/apps/backend && node dist/dry-run-auto-cancel.js"
 */
import { PrismaClient } from '@prisma/client';
import { isTerminalAppointmentStatus } from '@properfy/shared';
import { formatDate, startOfPlatformToday, PLATFORM_TIMEZONE } from '../shared/domain/timezone-date';
import { PrismaAppointmentRepository } from '../modules/appointment/infrastructure/prisma-appointment.repository';
import { DEFAULT_BATCH_LIMIT } from '../modules/appointment/application/use-cases/cancel-overdue-appointments.use-case';
import { CANCELLABLE_GROUP_STATUSES, isServiceGroupDead } from '../modules/service-group/application/services/cancel-empty-group.service';

/** How many groups to itemise per section; the counts beside them are never capped. */
const LIST_LIMIT = 20;

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
  // This report is unbounded, but one sweep run is capped. Without saying so, an
  // operator who sees a big number here, runs the sweep once and finds most rows
  // still active would reasonably conclude the sweep is broken.
  if (overdue.length > DEFAULT_BATCH_LIMIT) {
    const runs = Math.ceil(overdue.length / DEFAULT_BATCH_LIMIT);
    console.log(
      `  NOTE: one sweep run cancels at most ${DEFAULT_BATCH_LIMIT}, so this backlog drains over ~${runs} daily runs`,
    );
  }
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

  // Same predicate the sweep uses, so this report cannot disagree with it.
  const dead = groups.filter((g) => isServiceGroupDead(g.appointments));
  const skippedForDone = groups.filter(
    (g) =>
      !isServiceGroupDead(g.appointments) &&
      !g.appointments.some((a) => !isTerminalAppointmentStatus(a.status)),
  );

  // Itemised lists are capped, but the counts above them are always complete, and
  // any elision is stated — a silently truncated list reads as "that was all".
  const listGroups = (rows: typeof groups, describe: (g: (typeof groups)[number]) => string): void => {
    for (const g of rows.slice(0, LIST_LIMIT)) console.log(`  #${g.group_number} (${g.status}) — ${describe(g)}`);
    if (rows.length > LIST_LIMIT) console.log(`  ... and ${rows.length - LIST_LIMIT} more`);
  };

  console.log(`Released groups examined: ${groups.length}`);
  console.log(`WOULD CANCEL ${dead.length} group(s) with nothing left to execute`);
  listGroups(dead, (g) => `${g.appointments.length} linked member(s), none live, none DONE`);
  console.log(`PROTECTED by the DONE rule (would be wrongly cancelled without it): ${skippedForDone.length}`);
  listGroups(skippedForDone, () => 'has a DONE member, left alone');

  console.log('\nNo writes performed.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
