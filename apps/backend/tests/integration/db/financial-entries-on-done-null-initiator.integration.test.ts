/**
 * Financial entries are created on cross-checked DONE — real database verification.
 *
 * Production regression (blank financial reports): a cross-checked DONE
 * appointment must mint a TENANT_DEBIT + INSPECTOR_PAYOUT pair, but every
 * insert set `initiated_by_user_id = 'SYSTEM'` while that column was a NOT NULL
 * FK to `users` and no `users` row with id 'SYSTEM' exists. Each insert failed
 * the FK, the error was swallowed by a bare `catch {}`, and the ledger stayed
 * empty — so the financial report (APPROVED-only) rendered header rows only.
 *
 * The fix makes the initiator nullable and writes NULL for system-minted
 * entries. This test proves it against a real PostgreSQL database: a mocked
 * repository would accept anything and hide exactly this FK/nullability
 * regression. It is the wiring coverage that was missing — every prior test
 * mocked the onDone handler and never persisted a real row.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, seedLegacyDoneAppointment, type DbHarness } from './harness';
import { CreateFinancialEntriesOnDoneUseCase } from '../../../src/modules/billing/application/use-cases/create-financial-entries-on-done.use-case';
import { PrismaFinancialEntryRepository } from '../../../src/modules/billing/infrastructure/prisma-financial-entry.repository';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { PrismaTenantRepository } from '../../../src/modules/tenant/infrastructure/prisma-tenant.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';

function silentAuditService() {
  return { log: () => {} } as unknown as AuditService;
}

// The use-case only reads `get` (cache miss) and writes `set` (best-effort);
// a no-op stub exercises the real DB path without a pg-backed idempotency table.
function noopIdempotencyService() {
  return {
    get: async () => null,
    set: async () => {},
  } as unknown as IIdempotencyService;
}

describe('CreateFinancialEntriesOnDoneUseCase (real DB)', () => {
  let harness: DbHarness | undefined;

  beforeAll(async () => {
    harness = await setupDbHarness();
  }, 120_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('persists TENANT_DEBIT + INSPECTOR_PAYOUT with a NULL initiator for a cross-checked DONE appointment', async () => {
    const prisma = harness!.prisma;
    const fixture = await seedLegacyDoneAppointment(prisma, { tenantName: 'FIN-ON-DONE Tenant' });

    // The appointment is seeded DONE-but-not-cross-checked; record the operator
    // cross-check that gates entry creation.
    await prisma.appointment.update({
      where: { id: fixture.appointmentId },
      data: { done_checked_by_user_id: fixture.userId, done_checked_at: new Date() },
    });

    const useCase = new CreateFinancialEntriesOnDoneUseCase(
      new PrismaAppointmentRepository(prisma),
      new PrismaFinancialEntryRepository(prisma),
      silentAuditService(),
      noopIdempotencyService(),
      new PrismaTenantRepository(prisma),
    );

    const result = await useCase.execute({ appointmentId: fixture.appointmentId });

    expect(result.debitEntryId).not.toBeNull();
    expect(result.payoutEntryId).not.toBeNull();

    const entries = await prisma.financialEntry.findMany({
      where: { appointment_id: fixture.appointmentId },
      orderBy: { entry_type: 'asc' },
    });

    // Both legs actually landed in the ledger — the FK no longer blocks them.
    expect(entries).toHaveLength(2);

    const tenantDebit = entries.find((e) => e.entry_type === 'TENANT_DEBIT');
    const inspectorPayout = entries.find((e) => e.entry_type === 'INSPECTOR_PAYOUT');

    expect(tenantDebit).toBeDefined();
    expect(inspectorPayout).toBeDefined();

    // The exact bug: system-minted entries carry NO human initiator.
    expect(tenantDebit!.initiated_by_user_id).toBeNull();
    expect(inspectorPayout!.initiated_by_user_id).toBeNull();

    // Born PENDING; amounts mirror the appointment.
    expect(tenantDebit!.status).toBe('PENDING');
    expect(inspectorPayout!.status).toBe('PENDING');
    expect(Number(tenantDebit!.amount)).toBe(100);
    expect(Number(inspectorPayout!.amount)).toBe(80);
  });
});
