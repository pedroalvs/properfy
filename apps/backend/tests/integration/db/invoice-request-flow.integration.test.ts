/**
 * Real-DB test for the Inspector Property Invoice request flow (spec 032, Batch 2).
 *
 * Exercises RequestInvoiceUseCase against real repositories: aggregation of approved payouts,
 * the application-level one-active-invoice-per-period rule, and the VOID-can-be-re-requested
 * semantics (VOID is not ACTIVE).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, seedLegacyDoneAppointment, type DbHarness } from './harness';
import { PrismaFinancialEntryRepository } from '../../../src/modules/billing/infrastructure/prisma-financial-entry.repository';
import { PrismaInspectorInvoiceRepository } from '../../../src/modules/billing/infrastructure/prisma-inspector-invoice.repository';
import { PrismaInspectorRepository } from '../../../src/modules/inspector/infrastructure/prisma-inspector.repository';
import { RequestInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/request-invoice.use-case';
import { InvoiceActiveExistsError, InvoiceEmptyPeriodError, InvoiceMixedCurrencyError } from '../../../src/modules/billing/domain/billing.errors';
import { FakeClock } from '../../helpers/fake-clock';

let harness: DbHarness;

// A closed, cycle-aligned FORTNIGHTLY period relative to the frozen clock.
const NOW = new Date('2026-07-15T02:00:00.000Z');
const PERIOD = { periodStart: '2026-06-29', periodEnd: '2026-07-12' };
const auditStub = { log: () => {} } as any;

async function buildUseCase() {
  return new RequestInvoiceUseCase(
    new PrismaInspectorInvoiceRepository(harness.prisma),
    new PrismaFinancialEntryRepository(harness.prisma),
    new PrismaInspectorRepository(harness.prisma),
    auditStub,
    new FakeClock(NOW),
  );
}

async function seedInspectorWithPayouts(suffix: string, currencies: string[]) {
  const fixture = await seedLegacyDoneAppointment(harness.prisma, { tenantName: `Req Flow ${suffix}` });
  const inspector = await harness.prisma.inspector.create({
    data: { name: `Req Flow ${suffix}`, email: `req-flow-${suffix}@test.local`, billing_cycle: 'FORTNIGHTLY' },
  });
  let i = 0;
  for (const currency of currencies) {
    await harness.prisma.financialEntry.create({
      data: {
        tenant_id: fixture.tenantId,
        appointment_id: fixture.appointmentId,
        inspector_id: inspector.id,
        entry_type: 'INSPECTOR_PAYOUT',
        amount: '80.00',
        currency,
        status: 'APPROVED',
        description: `payout ${i++}`,
        effective_at: new Date('2026-07-01T02:00:00.000Z'), // within the Sydney period
        initiated_by_user_id: fixture.userId,
      },
    });
  }
  return inspector.id;
}

describe('Invoice request flow (real DB)', () => {
  beforeAll(async () => {
    harness = await setupDbHarness();
  }, 180_000);
  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('creates a PENDING_REVIEW invoice and blocks a second active request for the same period', async () => {
    const inspectorId = await seedInspectorWithPayouts('a', ['AUD', 'AUD']);
    const uc = await buildUseCase();

    const first = await uc.execute({ inspectorId, ...PERIOD });
    expect(first.status).toBe('PENDING_REVIEW');
    expect(first.totalAmount).toBe(160);
    expect(first.payoutCount).toBe(2);
    expect(first.currency).toBe('AUD');

    const row = await harness.prisma.inspectorInvoice.findUniqueOrThrow({ where: { id: first.invoiceId } });
    expect(row.status).toBe('PENDING_REVIEW');
    expect(row.invoice_number).toBeNull();
    expect(row.drafted_by_inspector_id).toBe(inspectorId);

    // Second active request for the same period → blocked by the active-period rule.
    await expect(uc.execute({ inspectorId, ...PERIOD })).rejects.toBeInstanceOf(InvoiceActiveExistsError);

    // Once the first invoice is VOID (rejected), a fresh request is allowed again — the ACTIVE-only
    // partial unique index lets a VOID row coexist with a new PENDING_REVIEW for the same period.
    await harness.prisma.inspectorInvoice.update({ where: { id: first.invoiceId }, data: { status: 'VOID' } });
    const second = await uc.execute({ inspectorId, ...PERIOD });
    expect(second.status).toBe('PENDING_REVIEW');
    expect(second.invoiceId).not.toBe(first.invoiceId);
  });

  it('rejects a period with no approved payouts', async () => {
    const inspectorId = await seedInspectorWithPayouts('b', []); // no payout entries
    const uc = await buildUseCase();
    await expect(uc.execute({ inspectorId, ...PERIOD })).rejects.toBeInstanceOf(InvoiceEmptyPeriodError);
  });

  it('rejects a period whose approved payouts span multiple currencies', async () => {
    const inspectorId = await seedInspectorWithPayouts('mc', ['AUD', 'USD']);
    const uc = await buildUseCase();
    await expect(uc.execute({ inspectorId, ...PERIOD })).rejects.toBeInstanceOf(InvoiceMixedCurrencyError);
  });

  it('two concurrent requests for the same period: one wins, the other gets a clean conflict (partial-unique backstop)', async () => {
    const inspectorId = await seedInspectorWithPayouts('c', ['AUD']);
    const uc = await buildUseCase();

    // The app-level findActive check has a race window; the partial unique index is the backstop and
    // must surface as InvoiceActiveExistsError, not a raw 500 (P2002).
    const results = await Promise.allSettled([
      uc.execute({ inspectorId, ...PERIOD }),
      uc.execute({ inspectorId, ...PERIOD }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(InvoiceActiveExistsError);

    const count = await harness.prisma.inspectorInvoice.count({ where: { inspector_id: inspectorId, status: 'PENDING_REVIEW' } });
    expect(count).toBe(1);
  });
});
