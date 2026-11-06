/**
 * READ-ONLY dry run for the empty-group cancellation sweep.
 *
 * Reports exactly what `service-group.cancel-empty` WOULD act on, without writing
 * anything. Deliberately read-only: the sweep is unscoped by tenant, so running the
 * real thing against a shared database would cancel every dead group in it, not just
 * a seeded fixture.
 *
 * Usage — locally, from apps/backend with a .env present:
 *   pnpm exec tsx --env-file=.env src/scripts/dry-run-cancel-empty-groups.ts
 *
 * Usage — against a deployed environment, without copying its credentials
 * anywhere (bundled into the image via the tsup entry map):
 *   fly ssh console -a properfy-prod -C \
 *     "cd /app/apps/backend && node dist/dry-run-cancel-empty-groups.js"
 */
import { PrismaClient } from '@prisma/client';
import { isTerminalAppointmentStatus } from '@properfy/shared';
import { CANCELLABLE_GROUP_STATUSES, isServiceGroupDead } from '../modules/service-group/application/services/cancel-empty-group.service';

/** How many groups to itemise per section; the counts beside them are never capped. */
const LIST_LIMIT = 20;

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Released groups with nothing left to execute.
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
