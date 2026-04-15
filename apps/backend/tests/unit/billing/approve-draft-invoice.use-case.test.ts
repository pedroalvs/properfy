import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApproveDraftInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/approve-draft-invoice.use-case';
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
const jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };

function makePendingReviewInvoice(overrides: Record<string, unknown> = {}) {
  return new InspectorInvoiceEntity({
    id: 'inv-1',
    inspectorId: 'insp-1',
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-03-15'),
    periodType: 'BIWEEKLY',
    status: 'PENDING_REVIEW',
    totalAmount: 1200,
    currency: 'AUD',
    fileKey: null,
    previousInvoiceId: null,
    generatedByUserId: null,
    generatedAt: null,
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
  return new ApproveDraftInvoiceUseCase(
    invoiceRepo,
    auditService as any,
    authorizationService,
    jobQueue,
  );
}

describe('ApproveDraftInvoiceUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoiceRepo.findById.mockResolvedValue(makePendingReviewInvoice());
    invoiceRepo.update.mockResolvedValue(undefined);
  });

  it('should approve a PENDING_REVIEW invoice and transition to CLOSED', async () => {
    const sut = makeSut();

    const result = await sut.execute({ invoiceId: 'inv-1', actor: opActor });

    expect(result.id).toBe('inv-1');
    expect(result.status).toBe('CLOSED');
    expect(result.generatedByUserId).toBe('op-1');
    expect(result.generatedAt).toBeDefined();

    expect(invoiceRepo.update).toHaveBeenCalledWith('inv-1', {
      status: 'CLOSED',
      generatedByUserId: 'op-1',
      generatedAt: expect.any(Date),
    });

    expect(jobQueue.enqueue).toHaveBeenCalledWith(
      'billing.generate-invoice-file',
      { invoiceId: 'inv-1' },
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspector_invoice.approved',
        actorType: 'USER',
        actorId: 'op-1',
        entityType: 'InspectorInvoice',
        entityId: 'inv-1',
        after: expect.objectContaining({
          inspectorId: 'insp-1',
          invoiceId: 'inv-1',
          draftedByInspectorId: 'insp-1',
          approvedByUserId: 'op-1',
        }),
      }),
    );
  });

  it('should reject when invoice not found', async () => {
    const sut = makeSut();
    invoiceRepo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({ invoiceId: 'nonexistent', actor: opActor }),
    ).rejects.toThrow(InvoiceNotFoundError);
  });

  it('should reject when invoice is not in PENDING_REVIEW status', async () => {
    const sut = makeSut();
    invoiceRepo.findById.mockResolvedValue(makePendingReviewInvoice({ status: 'CLOSED' }));

    await expect(
      sut.execute({ invoiceId: 'inv-1', actor: opActor }),
    ).rejects.toThrow(InvoiceNotPendingReviewError);
  });

  it('should reject non-AM/OP actor (CL_ADMIN)', async () => {
    const sut = makeSut();
    const clientActor = {
      userId: 'cl-1',
      tenantId: 'tenant-1',
      role: 'CL_ADMIN' as const,
      branchId: null,
      inspectorId: null,
    };

    await expect(
      sut.execute({ invoiceId: 'inv-1', actor: clientActor }),
    ).rejects.toThrow(ForbiddenError);
  });
});
