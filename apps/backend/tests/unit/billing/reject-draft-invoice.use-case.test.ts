import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RejectDraftInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/reject-draft-invoice.use-case';
import { InspectorInvoiceEntity } from '../../../src/modules/billing/domain/inspector-invoice.entity';
import {
  InvoiceNotFoundError,
  InvoiceNotPendingReviewError,
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
  voidIfPendingReview: vi.fn(),
  getReconciliationAggregates: vi.fn(),
};

const auditService = { log: vi.fn() };

function makePendingReviewInvoice(overrides: Record<string, unknown> = {}) {
  return new InspectorInvoiceEntity({
    id: 'inv-1',
    inspectorId: 'insp-1',
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-03-15'),
    periodType: 'FORTNIGHTLY',
    status: 'PENDING_REVIEW',
    totalAmount: 1200,
    currency: 'AUD',
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

const opActor = {
  userId: 'op-1',
  tenantId: 'tenant-1',
  role: 'OP' as const,
  branchId: null,
  inspectorId: null,
};

const amActor = {
  userId: 'am-1',
  tenantId: null,
  role: 'AM' as const,
  branchId: null,
  inspectorId: null,
};

const authorizationService = new AuthorizationService(auditService as any);

let idempotency: InMemoryIdempotencyService;

function makeSut() {
  return new RejectDraftInvoiceUseCase(
    invoiceRepo,
    auditService as any,
    authorizationService,
    idempotency,
  );
}

describe('RejectDraftInvoiceUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idempotency = new InMemoryIdempotencyService();
    invoiceRepo.findById.mockResolvedValue(makePendingReviewInvoice());
    invoiceRepo.voidIfPendingReview.mockResolvedValue(true);
  });

  it('should transition a PENDING_REVIEW invoice to VOID with the reason, and not delete it', async () => {
    const sut = makeSut();

    const result = await sut.execute({
      invoiceId: 'inv-1',
      reason: 'Period is incorrect, please resubmit',
      idempotencyKey: 'reject-key',
      actor: opActor,
    });

    expect(result.invoiceId).toBe('inv-1');
    expect(result.status).toBe('VOID');

    // Guarded conditional update (WHERE status=PENDING_REVIEW) so a concurrent approve can't be
    // overwritten.
    expect(invoiceRepo.voidIfPendingReview).toHaveBeenCalledWith('inv-1', 'Period is incorrect, please resubmit');
    expect(invoiceRepo.deleteById).not.toHaveBeenCalled();

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspector_invoice.draft_rejected',
        actorType: 'USER',
        actorId: 'op-1',
        entityType: 'InspectorInvoice',
        entityId: 'inv-1',
        after: expect.objectContaining({
          inspectorId: 'insp-1',
          invoiceId: 'inv-1',
          draftedByInspectorId: 'insp-1',
          rejectedByUserId: 'op-1',
          reason: 'Period is incorrect, please resubmit',
        }),
      }),
    );
  });

  it('should reject when invoice not found', async () => {
    const sut = makeSut();
    invoiceRepo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({ invoiceId: 'nonexistent', reason: 'Not needed anymore', idempotencyKey: 'reject-key', actor: opActor }),
    ).rejects.toThrow(InvoiceNotFoundError);
  });

  it('should reject when invoice is not in PENDING_REVIEW status', async () => {
    const sut = makeSut();
    invoiceRepo.findById.mockResolvedValue(makePendingReviewInvoice({ status: 'CLOSED' }));

    await expect(
      sut.execute({ invoiceId: 'inv-1', reason: 'Not needed anymore', idempotencyKey: 'reject-key', actor: opActor }),
    ).rejects.toThrow(InvoiceNotPendingReviewError);
  });

  it('should reject non-AM/OP actor (INSP)', async () => {
    const sut = makeSut();
    const inspActor = {
      userId: 'insp-1',
      tenantId: 'tenant-1',
      role: 'INSP' as const,
      branchId: null,
      inspectorId: 'insp-1',
    };

    await expect(
      sut.execute({ invoiceId: 'inv-1', reason: 'Not needed anymore', idempotencyKey: 'reject-key', actor: inspActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  // ─── HOL-3b: idempotency on the draft-rejection transition ─────────────────
  describe('idempotency (HOL-3b)', () => {
    it('replays the cached success on a duplicate key instead of re-running the transition', async () => {
      const sut = makeSut();
      const first = await sut.execute({
        invoiceId: 'inv-1', reason: 'Period is incorrect', idempotencyKey: 'dup-key', actor: opActor,
      });

      // The invoice is now VOID; a naive re-run would throw
      // InvoiceNotPendingReviewError. The claim must replay the cached success,
      // and voidIfPendingReview must NOT run a second time.
      invoiceRepo.findById.mockResolvedValue(makePendingReviewInvoice({ status: 'VOID' }));
      const replay = await sut.execute({
        invoiceId: 'inv-1', reason: 'Period is incorrect', idempotencyKey: 'dup-key', actor: opActor,
      });

      expect(replay).toEqual(first);
      expect(invoiceRepo.voidIfPendingReview).toHaveBeenCalledTimes(1);
    });

    it('runs the transition exactly once under two concurrent same-key calls', async () => {
      const sut = makeSut();
      // First tryAcquire claims the key; the second sees in_progress and is
      // rejected. Without the guard both would run and the loser would throw
      // InvoiceNotPendingReviewError (the DB optimistic guard), not
      // BillingIdempotencyInProgressError.
      const results = await Promise.allSettled([
        sut.execute({ invoiceId: 'inv-1', reason: 'dup', idempotencyKey: 'race-key', actor: opActor }),
        sut.execute({ invoiceId: 'inv-1', reason: 'dup', idempotencyKey: 'race-key', actor: opActor }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(BillingIdempotencyInProgressError);
      expect(invoiceRepo.voidIfPendingReview).toHaveBeenCalledTimes(1);
    });

    it('rejects a reused key carrying a different payload', async () => {
      const sut = makeSut();
      await sut.execute({ invoiceId: 'inv-1', reason: 'first reason', idempotencyKey: 'shared-key', actor: opActor });

      // Same key, different reason → payload hash mismatch.
      await expect(
        sut.execute({ invoiceId: 'inv-1', reason: 'a different reason', idempotencyKey: 'shared-key', actor: opActor }),
      ).rejects.toThrow(BillingIdempotencyPayloadMismatchError);
    });
  });
});
