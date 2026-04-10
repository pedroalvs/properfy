import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReverseInvoicePaymentUseCase } from '../../../src/modules/billing/application/use-cases/reverse-invoice-payment.use-case';
import { InspectorInvoiceEntity } from '../../../src/modules/billing/domain/inspector-invoice.entity';
import {
  InvoiceNotFoundError,
  InvoiceNotPaidError,
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
  getReconciliationAggregates: vi.fn(),
};

const auditService = { log: vi.fn() };

function makePaidInvoice(overrides: Record<string, unknown> = {}) {
  return new InspectorInvoiceEntity({
    id: 'inv-1',
    inspectorId: 'insp-1',
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-03-15'),
    periodType: 'BIWEEKLY',
    status: 'PAID',
    totalAmount: 1000,
    currency: 'AUD',
    fileKey: null,
    previousInvoiceId: null,
    generatedByUserId: 'op-1',
    generatedAt: new Date('2026-03-16T10:00:00.000Z'),
    paidAt: new Date('2026-03-20T14:00:00.000Z'),
    paidByUserId: 'op-1',
    paymentReference: 'BT-001',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

const opActor = {
  userId: 'op-2',
  tenantId: 'tenant-1',
  role: 'OP' as const,
  branchId: null,
  inspectorId: null,
};

const clientActor = {
  userId: 'cl-1',
  tenantId: 'tenant-1',
  role: 'CL_ADMIN' as const,
  branchId: null,
  inspectorId: null,
};

const authorizationService = new AuthorizationService(auditService as any);

function makeSut() {
  return new ReverseInvoicePaymentUseCase(invoiceRepo, auditService as any, authorizationService);
}

describe('ReverseInvoicePaymentUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoiceRepo.findById.mockResolvedValue(makePaidInvoice());
    invoiceRepo.update.mockResolvedValue(undefined);
  });

  it('reverses a PAID invoice back to CLOSED and clears payment fields (happy path)', async () => {
    const sut = makeSut();

    const result = await sut.execute({
      invoiceId: 'inv-1',
      reason: 'Bank transfer rejected',
      actor: opActor,
    });

    expect(result).toEqual({
      id: 'inv-1',
      status: 'CLOSED',
      paidAt: null,
      paidByUserId: null,
      paymentReference: null,
    });

    expect(invoiceRepo.update).toHaveBeenCalledWith('inv-1', {
      status: 'CLOSED',
      paidAt: null,
      paidByUserId: null,
      paymentReference: null,
    });
  });

  it('writes an audit record including the reason and before/after snapshots', async () => {
    const sut = makeSut();

    await sut.execute({
      invoiceId: 'inv-1',
      reason: 'Wrong invoice selected',
      actor: opActor,
    });

    expect(auditService.log).toHaveBeenCalledOnce();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'invoice.payment_reversed',
        actorType: 'USER',
        actorId: 'op-2',
        entityType: 'InspectorInvoice',
        entityId: 'inv-1',
        reason: 'Wrong invoice selected',
        before: expect.objectContaining({
          status: 'PAID',
          paidByUserId: 'op-1',
          paymentReference: 'BT-001',
        }),
        after: expect.objectContaining({
          status: 'CLOSED',
          paidAt: null,
          paidByUserId: null,
          paymentReference: null,
        }),
      }),
    );
  });

  it('rejects reversal of a CLOSED invoice with InvoiceNotPaidError', async () => {
    const sut = makeSut();
    invoiceRepo.findById.mockResolvedValue(makePaidInvoice({ status: 'CLOSED' }));

    await expect(
      sut.execute({ invoiceId: 'inv-1', reason: 'test', actor: opActor }),
    ).rejects.toThrow(InvoiceNotPaidError);
  });

  it('rejects reversal of an OPEN invoice with InvoiceNotPaidError', async () => {
    const sut = makeSut();
    invoiceRepo.findById.mockResolvedValue(makePaidInvoice({ status: 'OPEN' }));

    await expect(
      sut.execute({ invoiceId: 'inv-1', reason: 'test', actor: opActor }),
    ).rejects.toThrow(InvoiceNotPaidError);
  });

  it('rejects when invoice is not found', async () => {
    const sut = makeSut();
    invoiceRepo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({ invoiceId: 'missing', reason: 'test', actor: opActor }),
    ).rejects.toThrow(InvoiceNotFoundError);
  });

  it('rejects non-AM/OP actors', async () => {
    const sut = makeSut();

    await expect(
      sut.execute({ invoiceId: 'inv-1', reason: 'test', actor: clientActor }),
    ).rejects.toThrow(ForbiddenError);
  });
});
