import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RejectDraftInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/reject-draft-invoice.use-case';
import { InspectorInvoiceEntity } from '../../../src/modules/billing/domain/inspector-invoice.entity';
import {
  InvoiceNotFoundError,
  InvoiceNotPendingReviewError,
} from '../../../src/modules/billing/domain/billing.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

const invoiceRepo = {
  findById: vi.fn(),
  findByInspectorAndPeriod: vi.fn(),
  findOverlapping: vi.fn(),
  findAll: vi.fn(),
  findManyByIds: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  deleteById: vi.fn(),
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

function makeSut() {
  return new RejectDraftInvoiceUseCase(
    invoiceRepo,
    auditService as any,
    authorizationService,
  );
}

describe('RejectDraftInvoiceUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoiceRepo.findById.mockResolvedValue(makePendingReviewInvoice());
    invoiceRepo.update.mockResolvedValue(undefined);
  });

  it('should transition a PENDING_REVIEW invoice to VOID with the reason, and not delete it', async () => {
    const sut = makeSut();

    const result = await sut.execute({
      invoiceId: 'inv-1',
      reason: 'Period is incorrect, please resubmit',
      actor: opActor,
    });

    expect(result.invoiceId).toBe('inv-1');
    expect(result.status).toBe('VOID');

    expect(invoiceRepo.update).toHaveBeenCalledWith('inv-1', {
      status: 'VOID',
      notes: 'Period is incorrect, please resubmit',
    });
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
      sut.execute({ invoiceId: 'nonexistent', reason: 'Not needed anymore', actor: opActor }),
    ).rejects.toThrow(InvoiceNotFoundError);
  });

  it('should reject when invoice is not in PENDING_REVIEW status', async () => {
    const sut = makeSut();
    invoiceRepo.findById.mockResolvedValue(makePendingReviewInvoice({ status: 'CLOSED' }));

    await expect(
      sut.execute({ invoiceId: 'inv-1', reason: 'Not needed anymore', actor: opActor }),
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
      sut.execute({ invoiceId: 'inv-1', reason: 'Not needed anymore', actor: inspActor }),
    ).rejects.toThrow(ForbiddenError);
  });
});
