/**
 * One-off repair for properties left without a branch by the appointment
 * import (it used to create every property with `branch_id = NULL`; fixed in
 * the same change that adds this script).
 *
 * A branch-less property is invisible in every branch-filtered picker — most
 * visibly, an operator creating an appointment for a branch cannot select the
 * property the import created for that same branch.
 *
 * The branch is inferred from the property's own appointments: an appointment
 * always carries a branch, so a property whose appointments all point at ONE
 * branch has an unambiguous answer. Properties whose appointments span several
 * branches, or that have none at all, are never guessed — they are skipped and
 * listed so a human can decide.
 *
 * Dry run by default; `--apply` writes. Safe to re-run (already-branched
 * properties are not selected).
 *
 * Run:
 *   pnpm --filter backend tsx --env-file .env src/scripts/backfill-property-branch.ts
 *   pnpm --filter backend tsx --env-file .env src/scripts/backfill-property-branch.ts --apply
 */

import { PrismaClient } from '@prisma/client';

export interface BackfillSkip {
  propertyId: string;
  propertyCode: string;
  reason: 'no_appointments' | 'multiple_branches';
  branchCount: number;
}

export interface BackfillSummary {
  scanned: number;
  inferable: number;
  applied: number;
  skipped: BackfillSkip[];
  dryRun: boolean;
}

/**
 * Exported for tests: runs the whole repair against an injected client so the
 * behaviour is verified on a real database rather than only through the CLI.
 */
export async function backfillPropertyBranch(
  prisma: PrismaClient,
  options: { apply: boolean; tenantId?: string },
): Promise<BackfillSummary> {
  const properties = await prisma.property.findMany({
    where: {
      branch_id: null,
      deleted_at: null,
      ...(options.tenantId ? { tenant_id: options.tenantId } : {}),
    },
    select: { id: true, tenant_id: true, property_code: true },
  });

  const summary: BackfillSummary = {
    scanned: properties.length,
    inferable: 0,
    applied: 0,
    skipped: [],
    dryRun: !options.apply,
  };

  for (const property of properties) {
    // Every status counts, cancelled included: a cancelled appointment still
    // records which branch the property was operated under. Scoped by tenant
    // as well as property: cross-tenant references shouldn't exist (create
    // validates the property's tenant), but evidence for a repair must not
    // depend on that holding.
    const branches = await prisma.appointment.findMany({
      where: { property_id: property.id, tenant_id: property.tenant_id },
      select: { branch_id: true },
      distinct: ['branch_id'],
    });

    if (branches.length === 0) {
      summary.skipped.push({ propertyId: property.id, propertyCode: property.property_code, reason: 'no_appointments', branchCount: 0 });
      continue;
    }
    if (branches.length > 1) {
      summary.skipped.push({ propertyId: property.id, propertyCode: property.property_code, reason: 'multiple_branches', branchCount: branches.length });
      continue;
    }

    summary.inferable++;
    if (!options.apply) continue;

    // Conditional write: `branch_id: null` in the WHERE means a branch assigned
    // by someone else between the scan and here is never overwritten. `applied`
    // counts rows this run actually changed, not rows it intended to change.
    const updated = await prisma.property.updateMany({
      where: { id: property.id, tenant_id: property.tenant_id, branch_id: null },
      data: { branch_id: branches[0]!.branch_id },
    });
    summary.applied += updated.count;
  }

  return summary;
}

async function main() {
  const apply = process.argv.includes('--apply');
  // Optional: repair one agency at a time. Omitted, the script sweeps the whole
  // environment — it is an operator-run maintenance task, not a request-path
  // query, and the tenant of each row is carried through every statement.
  const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant-id='));
  const tenantId = tenantArg?.split('=')[1];
  const prisma = new PrismaClient({ log: [] });

  const scope = tenantId ? `tenant ${tenantId}` : 'all tenants';
  console.log(`\n=== backfill-property-branch (${apply ? 'APPLY' : 'DRY RUN'}, ${scope}) ===\n`);

  try {
    const summary = await backfillPropertyBranch(prisma, { apply, ...(tenantId ? { tenantId } : {}) });

    console.log(`  properties without a branch : ${summary.scanned}`);
    console.log(`  inferable (one branch)      : ${summary.inferable}`);
    console.log(`  updated                     : ${summary.applied}`);
    console.log(`  skipped                     : ${summary.skipped.length}`);

    if (summary.skipped.length > 0) {
      console.log('\n  Skipped — resolve by hand if they matter:');
      for (const skip of summary.skipped) {
        const detail = skip.reason === 'multiple_branches'
          ? `appointments span ${skip.branchCount} branches`
          : 'no appointments to infer from';
        console.log(`    ${skip.propertyCode} (${skip.propertyId}) — ${detail}`);
      }
    }

    if (!apply) {
      console.log('\n  DRY RUN — nothing was written. Re-run with --apply to persist.\n');
    } else {
      console.log('\n  Done.\n');
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when invoked directly — importing this module (tests) must not
// open a connection or touch the database.
if (process.argv[1] && process.argv[1].endsWith('backfill-property-branch.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
