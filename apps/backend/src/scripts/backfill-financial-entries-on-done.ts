/**
 * One-off repair for cross-checked DONE appointments that never got their
 * financial ledger entries.
 *
 * Cause (fixed in the same change that adds this script): the on-DONE entry
 * creation wrote `initiated_by_user_id = 'SYSTEM'` into a NOT NULL FK to
 * `users`, no such user existed, every insert failed the FK, and a bare
 * `catch {}` swallowed the error — so cross-checked appointments carried no
 * TENANT_DEBIT / INSPECTOR_PAYOUT and financial reports came back empty.
 *
 * This backfills the missing entries for appointments that are DONE and
 * operator-cross-checked (`done_checked_by_user_id` set) but have no financial
 * entries yet. It reuses `CreateFinancialEntriesOnDoneUseCase`, which is
 * idempotent (deterministic ids + per-type dedup), so it is safe to re-run and
 * never double-charges.
 *
 * Dry run by default; `--apply` writes. Optional `--tenant-id=<id>` to scope to
 * one agency.
 *
 * Run (tsup emits it flat at dist/, matching the other operational scripts):
 *   node dist/backfill-financial-entries-on-done.js
 *   node dist/backfill-financial-entries-on-done.js --apply
 */

import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import { CreateFinancialEntriesOnDoneUseCase } from '../modules/billing/application/use-cases/create-financial-entries-on-done.use-case';
import { PrismaFinancialEntryRepository } from '../modules/billing/infrastructure/prisma-financial-entry.repository';
import { PrismaAppointmentRepository } from '../modules/appointment/infrastructure/prisma-appointment.repository';
import { PrismaTenantRepository } from '../modules/tenant/infrastructure/prisma-tenant.repository';
import { PrismaAuditLogRepository } from '../modules/audit/infrastructure/prisma-audit-log.repository';
import { PersistentAuditService } from '../modules/audit/application/services/persistent-audit.service';
import type { IIdempotencyService } from '../shared/domain/idempotency.service';

interface OnDoneHandler {
  execute(input: { appointmentId: string }): Promise<{ debitEntryId: string | null; payoutEntryId: string | null }>;
}

export interface BackfillFinancialFailure {
  appointmentId: string;
  message: string;
}

export interface BackfillFinancialSummary {
  scanned: number;
  appointmentsRepaired: number;
  entriesCreated: number;
  failures: BackfillFinancialFailure[];
  dryRun: boolean;
}

/**
 * Exported for tests: runs the repair against injected collaborators so the
 * candidate selection and apply loop are verified without the CLI.
 */
export async function backfillFinancialEntriesOnDone(
  prisma: PrismaClient,
  useCase: OnDoneHandler,
  options: { apply: boolean; tenantId?: string },
): Promise<BackfillFinancialSummary> {
  // A cross-checked DONE appointment with zero financial entries is exactly the
  // stuck state. `financial_entries: { none: {} }` scopes to that; the use case
  // still fills any single missing leg for a selected appointment.
  const candidates = await prisma.appointment.findMany({
    where: {
      status: 'DONE',
      done_checked_by_user_id: { not: null },
      deleted_at: null,
      financial_entries: { none: {} },
      ...(options.tenantId ? { tenant_id: options.tenantId } : {}),
    },
    select: { id: true },
    orderBy: { created_at: 'asc' },
  });

  const summary: BackfillFinancialSummary = {
    scanned: candidates.length,
    appointmentsRepaired: 0,
    entriesCreated: 0,
    failures: [],
    dryRun: !options.apply,
  };

  if (!options.apply) return summary;

  for (const appt of candidates) {
    try {
      const result = await useCase.execute({ appointmentId: appt.id });
      summary.appointmentsRepaired++;
      if (result.debitEntryId) summary.entriesCreated++;
      if (result.payoutEntryId) summary.entriesCreated++;
    } catch (err) {
      summary.failures.push({ appointmentId: appt.id, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return summary;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant-id='));
  const tenantId = tenantArg?.split('=')[1];
  const prisma = new PrismaClient({ log: [] });
  const logger = pino({ level: 'info' });

  // Real audit service so backfilled entries record `financial_entry.created`
  // exactly as the live cross-check path does. Idempotency is a no-op: the use
  // case dedups per appointment+type at the database, which is the real guard.
  const auditService = new PersistentAuditService(new PrismaAuditLogRepository(prisma), logger);
  const noopIdempotency = { get: async () => null, set: async () => {} } as unknown as IIdempotencyService;
  const useCase = new CreateFinancialEntriesOnDoneUseCase(
    new PrismaAppointmentRepository(prisma),
    new PrismaFinancialEntryRepository(prisma),
    auditService,
    noopIdempotency,
    new PrismaTenantRepository(prisma),
  );

  const scope = tenantId ? `tenant ${tenantId}` : 'all tenants';
  console.log(`\n=== backfill-financial-entries-on-done (${apply ? 'APPLY' : 'DRY RUN'}, ${scope}) ===\n`);

  try {
    const summary = await backfillFinancialEntriesOnDone(prisma, useCase, { apply, ...(tenantId ? { tenantId } : {}) });

    console.log(`  cross-checked DONE, no entries : ${summary.scanned}`);
    console.log(`  appointments repaired          : ${summary.appointmentsRepaired}`);
    console.log(`  ledger entries created         : ${summary.entriesCreated}`);
    console.log(`  failures                       : ${summary.failures.length}`);

    if (summary.failures.length > 0) {
      console.log('\n  Failures — investigate by hand:');
      for (const failure of summary.failures) {
        console.log(`    ${failure.appointmentId} — ${failure.message}`);
      }
    }

    if (!apply) {
      console.log('\n  DRY RUN — nothing was written. Re-run with --apply to persist.\n');
    } else {
      console.log('\n  Done. Entries are PENDING; an operator must approve them to appear in the financial report.\n');
    }
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * True when this module is the process entrypoint rather than an import.
 * Matches the bundled `.js` too: production runs the compiled script, so a
 * `.ts`-only check would leave it a silent no-op exactly where it is needed.
 */
export function isDirectInvocation(entrypoint: string | undefined): boolean {
  return /[/\\]backfill-financial-entries-on-done\.(ts|js)$/.test(entrypoint ?? '');
}

if (isDirectInvocation(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
