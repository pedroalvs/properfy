/**
 * Real-DB test for the web backoffice agency/branch CONTENT filters (spec 032, Batch 4).
 * Verifies that `array_contains` (@>) matches invoices whose frozen snapshot has ≥1 line for the
 * agency/branch — as content, not ownership — and that the GIN index migration applies.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaInspectorInvoiceRepository } from '../../../src/modules/billing/infrastructure/prisma-inspector-invoice.repository';
import { ListInvoicesUseCase } from '../../../src/modules/billing/application/use-cases/list-invoices.use-case';

let harness: DbHarness;
const amActor = { userId: 'am-1', tenantId: null, role: 'AM' as const, branchId: null, inspectorId: null } as any;

const AGENCY_A = '11111111-1111-1111-1111-111111111111';
const AGENCY_B = '22222222-2222-2222-2222-222222222222';
const BRANCH_A = '33333333-3333-3333-3333-333333333333';
const BRANCH_B = '44444444-4444-4444-4444-444444444444';

async function makeInvoiceWithLines(inspectorId: string, invoiceNumber: number, month: number, lines: any[]) {
  const mm = String(month).padStart(2, '0');
  return harness.prisma.inspectorInvoice.create({
    data: {
      invoice_number: invoiceNumber,
      inspector_id: inspectorId,
      inspector_name: 'Inspector',
      period_start: new Date(`2026-${mm}-01`),
      period_end: new Date(`2026-${mm}-28`),
      period_type: 'MONTHLY',
      status: 'CLOSED',
      total_amount: '100.00',
      currency: 'AUD',
      line_items_snapshot: lines,
    },
  });
}

function line(agencyId: string, branchId: string) {
  return {
    serviceDate: '2026-06-02',
    appointmentId: '55555555-5555-5555-5555-555555555555',
    appointmentCode: 'ABC-0001',
    propertyAddress: '1 St',
    serviceType: 'Routine',
    amount: 100,
    agencyId,
    agencyName: 'Agency',
    branchId,
    branchName: 'Branch',
  };
}

describe('Invoice agency/branch content filters (real DB)', () => {
  let inspectorId: string;
  let multiAgencyId: string;
  let agencyBonlyId: string;

  beforeAll(async () => {
    harness = await setupDbHarness();
    const inspector = await harness.prisma.inspector.create({ data: { name: 'CF', email: 'cf@test.local' } });
    inspectorId = inspector.id;
    // June invoice spanning agency A + agency B (and branch A + branch B).
    const multi = await makeInvoiceWithLines(inspectorId, 5001, 6, [line(AGENCY_A, BRANCH_A), line(AGENCY_B, BRANCH_B)]);
    multiAgencyId = multi.id;
    // July invoice with only agency B / branch B.
    const bOnly = await makeInvoiceWithLines(inspectorId, 5002, 7, [line(AGENCY_B, BRANCH_B)]);
    agencyBonlyId = bOnly.id;
  }, 180_000);
  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  function list(filters: { agencyId?: string; branchId?: string }) {
    const useCase = new ListInvoicesUseCase(new PrismaInspectorInvoiceRepository(harness.prisma));
    return useCase.execute({ inspectorId, page: 1, pageSize: 50, actor: amActor, ...filters });
  }

  it('agency filter returns any invoice with ≥1 line for that agency (content, not ownership)', async () => {
    const byA = await list({ agencyId: AGENCY_A });
    expect(byA.data.map((d) => d.id)).toEqual([multiAgencyId]);

    const byB = await list({ agencyId: AGENCY_B });
    expect(new Set(byB.data.map((d) => d.id))).toEqual(new Set([multiAgencyId, agencyBonlyId]));
  });

  it('branch filter matches on snapshot content', async () => {
    const byBranchA = await list({ branchId: BRANCH_A });
    expect(byBranchA.data.map((d) => d.id)).toEqual([multiAgencyId]);
  });

  it('combines agency AND branch content conditions', async () => {
    // agency A appears only in the multi invoice, branch B also appears there → matches.
    const combined = await list({ agencyId: AGENCY_A, branchId: BRANCH_B });
    expect(combined.data.map((d) => d.id)).toEqual([multiAgencyId]);
  });

  it('returns empty for an agency present in no snapshot', async () => {
    const none = await list({ agencyId: '99999999-9999-9999-9999-999999999999' });
    expect(none.data).toHaveLength(0);
  });
});
