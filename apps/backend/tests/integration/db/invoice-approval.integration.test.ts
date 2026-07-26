/**
 * Real-DB test for the Inspector Property Invoice approval flow (spec 032, Batch 3): snapshot
 * freeze, sequential numbering (nextval), issued_at, and reject → VOID (retained).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, seedLegacyDoneAppointment, type DbHarness } from './harness';
import { PrismaFinancialEntryRepository } from '../../../src/modules/billing/infrastructure/prisma-financial-entry.repository';
import { PrismaInspectorInvoiceRepository } from '../../../src/modules/billing/infrastructure/prisma-inspector-invoice.repository';
import { PrismaInspectorRepository } from '../../../src/modules/inspector/infrastructure/prisma-inspector.repository';
import { RequestInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/request-invoice.use-case';
import { ApproveDraftInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/approve-draft-invoice.use-case';
import { RejectDraftInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/reject-draft-invoice.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { FakeClock } from '../../helpers/fake-clock';

let harness: DbHarness;
const NOW = new Date('2026-07-15T02:00:00.000Z');
const PERIOD = { periodStart: '2026-06-29', periodEnd: '2026-07-12' };
const auditStub = { log: () => {} } as any;
const jobQueueStub = { enqueue: async () => {} } as any;
let amActor: any;

async function seedApprover(): Promise<void> {
  // generated_by_user_id has a FK to users; approvals must reference a real user.
  const tenant = await harness.prisma.tenant.create({
    data: { name: 'Approver Tenant', legal_name: `Approver LLC ${Math.random().toString(36).slice(2, 8)}`, status: 'ACTIVE' },
  });
  const branch = await harness.prisma.branch.create({ data: { tenant_id: tenant.id, name: 'Approver Branch', status: 'ACTIVE' } });
  const user = await harness.prisma.user.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      role: 'OP',
      name: 'Approver',
      email: `approver-${Math.random().toString(36).slice(2, 8)}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  amActor = { userId: user.id, tenantId: tenant.id, role: 'OP', branchId: branch.id, inspectorId: null };
}

function repos() {
  return {
    invoiceRepo: new PrismaInspectorInvoiceRepository(harness.prisma),
    financialEntryRepo: new PrismaFinancialEntryRepository(harness.prisma),
    inspectorRepo: new PrismaInspectorRepository(harness.prisma),
  };
}

async function seedRequestedInvoice(suffix: string): Promise<string> {
  const fixture = await seedLegacyDoneAppointment(harness.prisma, { tenantName: `Approval ${suffix}` });
  const inspector = await harness.prisma.inspector.create({
    data: { name: `Approval ${suffix}`, email: `approval-${suffix}@test.local`, abn: '12 345 678 901', billing_cycle: 'FORTNIGHTLY' },
  });
  await harness.prisma.financialEntry.create({
    data: {
      tenant_id: fixture.tenantId,
      appointment_id: fixture.appointmentId,
      inspector_id: inspector.id,
      entry_type: 'INSPECTOR_PAYOUT',
      amount: '80.00',
      currency: 'AUD',
      status: 'APPROVED',
      description: 'payout',
      effective_at: new Date('2026-07-01T02:00:00.000Z'),
      initiated_by_user_id: fixture.userId,
    },
  });
  const { invoiceRepo, financialEntryRepo, inspectorRepo } = repos();
  const request = new RequestInvoiceUseCase(invoiceRepo, financialEntryRepo, inspectorRepo, auditStub, new FakeClock(NOW));
  const requested = await request.execute({ inspectorId: inspector.id, ...PERIOD });
  return requested.invoiceId;
}

describe('Invoice approval flow (real DB)', () => {
  beforeAll(async () => {
    harness = await setupDbHarness();
    await seedApprover();
  }, 180_000);
  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('freezes the snapshot with agency/branch, assigns a number and sets issued_at', async () => {
    const invoiceId = await seedRequestedInvoice('a');
    const { invoiceRepo, financialEntryRepo } = repos();
    const approve = new ApproveDraftInvoiceUseCase(invoiceRepo, financialEntryRepo, auditStub, new AuthorizationService(auditStub), jobQueueStub);

    const result = await approve.execute({ invoiceId, actor: amActor });
    expect(result.status).toBe('CLOSED');
    expect(result.invoiceNumber).toBeGreaterThan(0);
    expect(result.invoiceNumberDisplay).toMatch(/^PINV-\d{6}$/);

    const row = await harness.prisma.inspectorInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(row.status).toBe('CLOSED');
    expect(row.invoice_number).toBe(result.invoiceNumber);
    expect(row.issued_at).not.toBeNull();
    const snapshot = row.line_items_snapshot as any[];
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].agencyName).toBe(`Approval a`);
    expect(snapshot[0].branchName).toBe('T061 Branch');
    expect(snapshot[0].appointmentCode).toMatch(/^[A-Za-z]{3,4}-\d{4}$/); // no raw UUID
    expect(snapshot[0].amount).toBe(80);

    // ABN is frozen at approval from the live inspector.
    expect(row.inspector_abn).toBe('12 345 678 901');

    // Freezing is airtight: changing the inspector's live ABN afterwards must NOT leak onto the
    // already-frozen (CLOSED) invoice — the reader returns the stored value, never the live join.
    await harness.prisma.inspector.update({ where: { id: row.inspector_id }, data: { abn: '99 999 999 999' } });
    const reread = await invoiceRepo.findById(invoiceId);
    expect(reread?.inspectorAbn).toBe('12 345 678 901');
  });

  it('assigns strictly increasing numbers across invoices (sequence)', async () => {
    const { invoiceRepo, financialEntryRepo } = repos();
    const approve = new ApproveDraftInvoiceUseCase(invoiceRepo, financialEntryRepo, auditStub, new AuthorizationService(auditStub), jobQueueStub);
    const first = await approve.execute({ invoiceId: await seedRequestedInvoice('b'), actor: amActor });
    const second = await approve.execute({ invoiceId: await seedRequestedInvoice('c'), actor: amActor });
    expect(second.invoiceNumber).toBeGreaterThan(first.invoiceNumber);
  });

  it('reject transitions PENDING_REVIEW → VOID and retains the row with the reason', async () => {
    const invoiceId = await seedRequestedInvoice('d');
    const { invoiceRepo } = repos();
    const reject = new RejectDraftInvoiceUseCase(invoiceRepo, auditStub, new AuthorizationService(auditStub));
    const result = await reject.execute({ invoiceId, reason: 'Wrong period, please resubmit', actor: amActor });
    expect(result.status).toBe('VOID');
    const row = await harness.prisma.inspectorInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(row.status).toBe('VOID');
    expect(row.notes).toBe('Wrong period, please resubmit');
  });

  it('two concurrent approvals of the same invoice: exactly one wins (CAS), one gets NotPendingReview', async () => {
    const invoiceId = await seedRequestedInvoice('e');
    const { invoiceRepo, financialEntryRepo } = repos();
    const approve = new ApproveDraftInvoiceUseCase(invoiceRepo, financialEntryRepo, auditStub, new AuthorizationService(auditStub), jobQueueStub);

    const results = await Promise.allSettled([
      approve.execute({ invoiceId, actor: amActor }),
      approve.execute({ invoiceId, actor: amActor }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const row = await harness.prisma.inspectorInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(row.status).toBe('CLOSED');
    expect(row.invoice_number).not.toBeNull();
  });

  it('concurrent approve + reject: exactly one wins, the invoice ends CLOSED xor VOID (no overwrite)', async () => {
    const invoiceId = await seedRequestedInvoice('f');
    const { invoiceRepo, financialEntryRepo } = repos();
    const approve = new ApproveDraftInvoiceUseCase(invoiceRepo, financialEntryRepo, auditStub, new AuthorizationService(auditStub), jobQueueStub);
    const reject = new RejectDraftInvoiceUseCase(invoiceRepo, auditStub, new AuthorizationService(auditStub));

    const results = await Promise.allSettled([
      approve.execute({ invoiceId, actor: amActor }),
      reject.execute({ invoiceId, reason: 'Rejecting concurrently', actor: amActor }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    const row = await harness.prisma.inspectorInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(['CLOSED', 'VOID']).toContain(row.status);
  });
});
