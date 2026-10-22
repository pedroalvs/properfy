import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApproveDraftInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/approve-draft-invoice.use-case';
import { InspectorInvoiceEntity } from '../../../src/modules/billing/domain/inspector-invoice.entity';
import {
  InvoiceNotFoundError,
  InvoiceNotPendingReviewError,
  InvoiceEmptyPeriodError,
  InvoiceMixedCurrencyError,
  BillingIdempotencyInProgressError,
  BillingIdempotencyPayloadMismatchError,
} from '../../../src/modules/billing/domain/billing.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { InMemoryIdempotencyService } from '../../helpers/in-memory-idempotency.service';

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
    inspectorAbn: '12 345 678 901',
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

let idempotency: InMemoryIdempotencyService;

function makeSut() {
  return new ApproveDraftInvoiceUseCase(
    invoiceRepo as any,
    financialEntryRepo as any,
    auditService as any,
    authorizationService,
    jobQueue as any,
    idempotency,
  );
}

describe('ApproveDraftInvoiceUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idempotency = new InMemoryIdempotencyService();
    invoiceRepo.findById.mockResolvedValue(makePendingReviewInvoice());
    // Single read now returns both the frozen lines and the currencies (closes the TOCTOU window).
    financialEntryRepo.findApprovedPayoutLinesForSnapshot.mockResolvedValue({ lines: SNAPSHOT, currencies: ['AUD'] });
    invoiceRepo.assignNumberAndFreeze.mockResolvedValue(42);
  });

  it('freezes the snapshot, assigns a number, sets issued_at and enqueues the PDF', async () => {
    const result = await makeSut().execute({ invoiceId: 'inv-1', actor: opActor, idempotencyKey: 'approve-key' });

    expect(result.status).toBe('CLOSED');
    expect(result.invoiceNumber).toBe(42);
    expect(result.invoiceNumberDisplay).toBe('PINV-000042');
    expect(result.generatedByUserId).toBe('op-1');

    expect(invoiceRepo.assignNumberAndFreeze).toHaveBeenCalledWith('inv-1', {
      lineItemsSnapshot: SNAPSHOT,
      totalAmount: 700,
      inspectorName: 'Jane Inspector',
      inspectorAbn: '12 345 678 901',
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
    await makeSut().execute({ invoiceId: 'inv-1', actor: opActor, idempotencyKey: 'approve-key' });
    const frozen = invoiceRepo.assignNumberAndFreeze.mock.calls[0][1].lineItemsSnapshot;
    for (const line of frozen) {
      expect(line.appointmentCode).toMatch(/^[A-Za-z0-9]{3,4}-\d{4,}$/);
    }
  });

  it('rejects when invoice not found', async () => {
    invoiceRepo.findById.mockResolvedValue(null);
    await expect(makeSut().execute({ invoiceId: 'x', actor: opActor, idempotencyKey: 'approve-key' })).rejects.toThrow(InvoiceNotFoundError);
  });

  it('rejects when invoice is not PENDING_REVIEW', async () => {
    invoiceRepo.findById.mockResolvedValue(makePendingReviewInvoice({ status: 'CLOSED' }));
    await expect(makeSut().execute({ invoiceId: 'inv-1', actor: opActor, idempotencyKey: 'approve-key' })).rejects.toThrow(InvoiceNotPendingReviewError);
  });

  it('rejects when the period has no approved payouts at approval time', async () => {
    financialEntryRepo.findApprovedPayoutLinesForSnapshot.mockResolvedValue({ lines: [], currencies: [] });
    await expect(makeSut().execute({ invoiceId: 'inv-1', actor: opActor, idempotencyKey: 'approve-key' })).rejects.toThrow(InvoiceEmptyPeriodError);
    expect(invoiceRepo.assignNumberAndFreeze).not.toHaveBeenCalled();
  });

  it('rejects when payouts span multiple currencies at approval time', async () => {
    financialEntryRepo.findApprovedPayoutLinesForSnapshot.mockResolvedValue({ lines: SNAPSHOT, currencies: ['AUD', 'USD'] });
    await expect(makeSut().execute({ invoiceId: 'inv-1', actor: opActor, idempotencyKey: 'approve-key' })).rejects.toThrow(InvoiceMixedCurrencyError);
  });

  it('throws NotPendingReview when it loses an approval race (assignNumberAndFreeze returns null)', async () => {
    invoiceRepo.assignNumberAndFreeze.mockResolvedValue(null);
    await expect(makeSut().execute({ invoiceId: 'inv-1', actor: opActor, idempotencyKey: 'approve-key' })).rejects.toThrow(InvoiceNotPendingReviewError);
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects a non-AM/OP actor', async () => {
    const clientActor = { userId: 'cl-1', tenantId: 'tenant-1', role: 'CL_ADMIN' as const, branchId: null, inspectorId: null };
    await expect(makeSut().execute({ invoiceId: 'inv-1', actor: clientActor, idempotencyKey: 'approve-key' })).rejects.toThrow(ForbiddenError);
  });

  // ─── HOL-3b: idempotency on the draft-approval transition ──────────────────
  describe('idempotency (HOL-3b)', () => {
    it('replays the cached success on a duplicate key instead of re-running the transition', async () => {
      const sut = makeSut();
      const first = await sut.execute({ invoiceId: 'inv-1', actor: opActor, idempotencyKey: 'dup-key' });

      // The invoice is now CLOSED. A naive re-run would reload it and throw
      // InvoiceNotPendingReviewError; the idempotency claim must return the
      // cached success instead. assignNumberAndFreeze must NOT run a second time.
      invoiceRepo.findById.mockResolvedValue(makePendingReviewInvoice({ status: 'CLOSED' }));
      const replay = await sut.execute({ invoiceId: 'inv-1', actor: opActor, idempotencyKey: 'dup-key' });

      expect(replay).toEqual(first);
      expect(invoiceRepo.assignNumberAndFreeze).toHaveBeenCalledTimes(1);
    });

    it('runs the transition exactly once under two concurrent same-key calls', async () => {
      const sut = makeSut();
      // Fire both before either resolves. The first tryAcquire claims the key
      // (in-flight); the second sees in_progress and is rejected, so the mutation
      // runs exactly once. Without the guard both would run and the loser would
      // throw InvoiceNotPendingReviewError (the DB optimistic guard), not
      // BillingIdempotencyInProgressError.
      const results = await Promise.allSettled([
        sut.execute({ invoiceId: 'inv-1', actor: opActor, idempotencyKey: 'race-key' }),
        sut.execute({ invoiceId: 'inv-1', actor: opActor, idempotencyKey: 'race-key' }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(BillingIdempotencyInProgressError);
      expect(invoiceRepo.assignNumberAndFreeze).toHaveBeenCalledTimes(1);
    });

    it('rejects a reused key carrying a different payload', async () => {
      const sut = makeSut();
      await sut.execute({ invoiceId: 'inv-1', actor: opActor, idempotencyKey: 'shared-key' });

      // Same key, different invoice id → payload hash mismatch.
      invoiceRepo.findById.mockResolvedValue(makePendingReviewInvoice({ id: 'inv-2' }));
      await expect(
        sut.execute({ invoiceId: 'inv-2', actor: opActor, idempotencyKey: 'shared-key' }),
      ).rejects.toThrow(BillingIdempotencyPayloadMismatchError);
    });
  });
});
