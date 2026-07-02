import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarkInvoicePaidUseCase } from '../../../src/modules/billing/application/use-cases/mark-invoice-paid.use-case';
import { InspectorInvoiceEntity } from '../../../src/modules/billing/domain/inspector-invoice.entity';
import { InvoiceNotClosedError } from '../../../src/modules/billing/domain/billing.errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

/**
 * FR-068 verification: PENDING_REVIEW invoices must NOT be markable as PAID.
 *
 * The existing MarkInvoicePaidUseCase already guards via canBeMarkedPaid()
 * which only returns true for CLOSED status. This test verifies that a
 * PENDING_REVIEW invoice is correctly rejected.
 */

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
const authorizationService = new AuthorizationService(auditService as any);

const opActor = {
  userId: 'op-1',
  tenantId: 'tenant-1',
  role: 'OP' as const,
  branchId: null,
  inspectorId: null,
};

describe('FR-068: PENDING_REVIEW invoice cannot be marked PAID', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw InvoiceNotClosedError when invoice status is PENDING_REVIEW', async () => {
    const pendingReviewInvoice = new InspectorInvoiceEntity({
      id: 'inv-pr-1',
      inspectorId: 'insp-1',
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-15'),
      periodType: 'FORTNIGHTLY',
      status: 'PENDING_REVIEW',
      totalAmount: 800,
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
    });

    invoiceRepo.findById.mockResolvedValue(pendingReviewInvoice);

    const sut = new MarkInvoicePaidUseCase(
      invoiceRepo,
      auditService as any,
      authorizationService,
    );

    await expect(
      sut.execute({ invoiceId: 'inv-pr-1', actor: opActor }),
    ).rejects.toThrow(InvoiceNotClosedError);
  });
});
