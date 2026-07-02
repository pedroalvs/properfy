/**
 * Real-DB smoke test for the Inspector Property Invoice foundation migrations (spec 032, Batch 1).
 *
 * Validates that the hand-written migrations apply cleanly to a fresh database and that the new
 * schema surface behaves as intended:
 *  - InspectorInvoiceStatus accepts VOID
 *  - BillingPeriodType uses FORTNIGHTLY (renamed from BIWEEKLY)
 *  - new columns exist: invoice_number, inspector_name, line_items_snapshot, issued_at
 *  - invoice_number carries a UNIQUE constraint
 *  - inspectors.billing_cycle accepts a BillingPeriodType value
 *
 * Runs under the real-DB vitest config (excluded from the default suite).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';

let harness: DbHarness;

async function seedInspector(prisma: DbHarness['prisma'], suffix: string) {
  return prisma.inspector.create({
    data: {
      name: `Inv Foundation ${suffix}`,
      email: `inv-foundation-${suffix}@test.local`,
      billing_cycle: 'FORTNIGHTLY',
    },
  });
}

describe('Inspector Property Invoice foundation migrations', () => {
  beforeAll(async () => {
    harness = await setupDbHarness();
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('persists a VOID / FORTNIGHTLY invoice with the new frozen columns', async () => {
    const inspector = await seedInspector(harness.prisma, 'a');
    const snapshot = [
      {
        serviceDate: '2026-03-02',
        appointmentId: '11111111-1111-1111-1111-111111111111',
        appointmentCode: 'ABC-0001',
        propertyAddress: '1 Test St, Sydney NSW 2000',
        serviceType: 'Routine Inspection',
        amount: 700,
        agencyId: '22222222-2222-2222-2222-222222222222',
        agencyName: 'Agency One',
        branchId: '33333333-3333-3333-3333-333333333333',
        branchName: 'Branch One',
      },
    ];

    const created = await harness.prisma.inspectorInvoice.create({
      data: {
        invoice_number: 1001,
        inspector_id: inspector.id,
        inspector_name: 'Inv Foundation A',
        period_start: new Date('2026-03-01'),
        period_end: new Date('2026-03-14'),
        period_type: 'FORTNIGHTLY',
        status: 'VOID',
        total_amount: '700.00',
        currency: 'AUD',
        line_items_snapshot: snapshot,
        issued_at: new Date('2026-03-16T00:00:00Z'),
      },
    });

    const read = await harness.prisma.inspectorInvoice.findUniqueOrThrow({ where: { id: created.id } });
    expect(read.status).toBe('VOID');
    expect(read.period_type).toBe('FORTNIGHTLY');
    expect(read.invoice_number).toBe(1001);
    expect(read.inspector_name).toBe('Inv Foundation A');
    expect(read.issued_at).toEqual(new Date('2026-03-16T00:00:00Z'));
    expect(read.line_items_snapshot).toEqual(snapshot);
  });

  it('enforces a UNIQUE constraint on invoice_number', async () => {
    const inspector = await seedInspector(harness.prisma, 'b');
    const base = {
      inspector_id: inspector.id,
      period_start: new Date('2026-04-01'),
      period_end: new Date('2026-04-14'),
      period_type: 'FORTNIGHTLY' as const,
      status: 'CLOSED' as const,
      total_amount: '100.00',
      currency: 'AUD',
    };
    await harness.prisma.inspectorInvoice.create({ data: { ...base, invoice_number: 2002 } });

    await expect(
      harness.prisma.inspectorInvoice.create({
        data: {
          ...base,
          period_start: new Date('2026-05-01'),
          period_end: new Date('2026-05-14'),
          invoice_number: 2002,
        },
      }),
    ).rejects.toThrow();
  });

  it('allows multiple NULL invoice_number rows (unassigned until approval)', async () => {
    const inspector = await seedInspector(harness.prisma, 'c');
    const mk = (start: string, end: string) =>
      harness.prisma.inspectorInvoice.create({
        data: {
          inspector_id: inspector.id,
          period_start: new Date(start),
          period_end: new Date(end),
          period_type: 'MONTHLY',
          status: 'PENDING_REVIEW',
          total_amount: '0.00',
          currency: 'AUD',
        },
      });
    await mk('2026-06-01', '2026-06-30');
    await expect(mk('2026-07-01', '2026-07-31')).resolves.toBeTruthy();
  });
});
