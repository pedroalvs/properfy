import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApproveDraftInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/approve-draft-invoice.use-case';
import { InspectorInvoiceEntity } from '../../../src/modules/billing/domain/inspector-invoice.entity';
import {
  InvoiceNotFoundError,
  InvoiceNotPendingReviewError,
  InvoiceEmptyPeriodError,
  InvoiceMixedCurrencyError,
} from '../../../src/modules/billing/domain/billing.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

const invoiceRepo = {
  findById: vi.fn(),
  findByInspectorAndPeriod: vi.fn(),
  findActiveByInspectorAndPeriod: vi.fn(),
  findAll: vi.fn(),
  findManyByIds: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  deleteById: vi.fn(),
  assignNumberAndFreeze: vi.fn(),
  getReconciliationAggregates: vi.fn(),
};

const financialEntryRepo = {
  aggregateApprovedPayoutsForInspectorInPeriod: vi.fn(),
  findApprovedPayoutLinesForSnapshot: vi.fn(),
};

const auditService = { log: vi.fn() };
const jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };

const SNAPSHOT = [
  { serviceDate: '2026-03-02', appointmentId: 'a1', appointmentCode: 'ABC-0001', propertyAddress: '1 St', serviceType: 'Routine', amount: 350, agencyId: 'ag1', agencyName: 'Agency', branchId: 'b1', branchName: 'Branch' },
  { serviceDate: '2026-03-05', appointmentId: 'a2', appointmentCode: 'ABC-0002', propertyAddress: '2 St', serviceType: 'Routine', amount: 350, agencyId: 'ag1', agencyName: 'Agency', branchId: 'b1', branchName: 'Branch' },
];

function makePendingReviewInvoice(overrides: Record<string, unknown> = {}) {
  return new InspectorInvoiceEntity({
    id: 'inv-1',
    invoiceNumber: null,
    inspectorId: 'insp-1',
    inspectorName: 'Jane Inspector',
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-03-15'),
    periodType: 'FORTNIGHTLY',
    status: 'PENDING_REVIEW',
    totalAmount: 0,
    currency: 'AUD',
    lineItemsSnapshot: null,
    fileKey: null,
    previousInvoiceId: null,
    generatedByUserId: null,
    issuedAt: null,
    paidAt: null,
    paidByUserId: null,
    paymentReference: null,
    notes: null,
    draftedByInspectorId: 'insp-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

const opActor = { userId: 'op-1', tenantId: 'tenant-1', role: 'OP' as const, branchId: null, inspectorId: null };
const authorizationService = new AuthorizationService(auditService as any);

function makeSut() {
  return new ApproveDraftInvoiceUseCase(
    invoiceRepo as any,
    financialEntryRepo as any,
    auditService as any,
    authorizationService,
    jobQueue as any,
  );
}

describe('ApproveDraftInvoiceUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoiceRepo.findById.mockResolvedValue(makePendingReviewInvoice());
    // Single read now returns both the frozen lines and the currencies (closes the TOCTOU window).
    financialEntryRepo.findApprovedPayoutLinesForSnapshot.mockResolvedValue({ lines: SNAPSHOT, currencies: ['AUD'] });
    invoiceRepo.assignNumberAndFreeze.mockResolvedValue(42);
  });

  it('freezes the snapshot, assigns a number, sets issued_at and enqueues the PDF', async () => {
    const result = await makeSut().execute({ invoiceId: 'inv-1', actor: opActor });

    expect(result.status).toBe('CLOSED');
    expect(result.invoiceNumber).toBe(42);
    expect(result.invoiceNumberDisplay).toBe('PINV-000042');
    expect(result.generatedByUserId).toBe('op-1');

    expect(invoiceRepo.assignNumberAndFreeze).toHaveBeenCalledWith('inv-1', {
      lineItemsSnapshot: SNAPSHOT,
      totalAmount: 700,
      inspectorName: 'Jane Inspector',
      issuedAt: expect.any(Date),
      generatedByUserId: 'op-1',
    });
    expect(jobQueue.enqueue).toHaveBeenCalledWith('billing.generate-invoice-file', { invoiceId: 'inv-1' });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspector_invoice.approved',
        after: expect.objectContaining({ invoiceNumber: 42, totalAmount: 700, lineCount: 2 }),
      }),
    );
  });

  it('never leaks a raw UUID in the snapshot appointment code', async () => {
    await makeSut().execute({ invoiceId: 'inv-1', actor: opActor });
    const frozen = invoiceRepo.assignNumberAndFreeze.mock.calls[0][1].lineItemsSnapshot;
    for (const line of frozen) {
      expect(line.appointmentCode).toMatch(/^[A-Za-z0-9]{3,4}-\d{4,}$/);
    }
  });

  it('rejects when invoice not found', async () => {
    invoiceRepo.findById.mockResolvedValue(null);
    await expect(makeSut().execute({ invoiceId: 'x', actor: opActor })).rejects.toThrow(InvoiceNotFoundError);
  });

  it('rejects when invoice is not PENDING_REVIEW', async () => {
    invoiceRepo.findById.mockResolvedValue(makePendingReviewInvoice({ status: 'CLOSED' }));
    await expect(makeSut().execute({ invoiceId: 'inv-1', actor: opActor })).rejects.toThrow(InvoiceNotPendingReviewError);
  });

  it('rejects when the period has no approved payouts at approval time', async () => {
    financialEntryRepo.findApprovedPayoutLinesForSnapshot.mockResolvedValue({ lines: [], currencies: [] });
    await expect(makeSut().execute({ invoiceId: 'inv-1', actor: opActor })).rejects.toThrow(InvoiceEmptyPeriodError);
    expect(invoiceRepo.assignNumberAndFreeze).not.toHaveBeenCalled();
  });

  it('rejects when payouts span multiple currencies at approval time', async () => {
    financialEntryRepo.findApprovedPayoutLinesForSnapshot.mockResolvedValue({ lines: SNAPSHOT, currencies: ['AUD', 'USD'] });
    await expect(makeSut().execute({ invoiceId: 'inv-1', actor: opActor })).rejects.toThrow(InvoiceMixedCurrencyError);
  });

  it('throws NotPendingReview when it loses an approval race (assignNumberAndFreeze returns null)', async () => {
    invoiceRepo.assignNumberAndFreeze.mockResolvedValue(null);
    await expect(makeSut().execute({ invoiceId: 'inv-1', actor: opActor })).rejects.toThrow(InvoiceNotPendingReviewError);
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects a non-AM/OP actor', async () => {
    const clientActor = { userId: 'cl-1', tenantId: 'tenant-1', role: 'CL_ADMIN' as const, branchId: null, inspectorId: null };
    await expect(makeSut().execute({ invoiceId: 'inv-1', actor: clientActor })).rejects.toThrow(ForbiddenError);
  });
});
