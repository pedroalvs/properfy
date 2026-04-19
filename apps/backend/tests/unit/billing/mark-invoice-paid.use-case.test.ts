import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarkInvoicePaidUseCase } from '../../../src/modules/billing/application/use-cases/mark-invoice-paid.use-case';
import { InspectorInvoiceEntity } from '../../../src/modules/billing/domain/inspector-invoice.entity';
import {
  InvoiceNotFoundError,
  InvoiceNotClosedError,
  InvoiceAlreadyPaidError,
  InvoicePaymentDateInvalidError,
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

function makeClosedInvoice(overrides: Record<string, unknown> = {}) {
  return new InspectorInvoiceEntity({
    id: 'inv-1',
    inspectorId: 'insp-1',
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-03-15'),
    periodType: 'BIWEEKLY',
    status: 'CLOSED',
    totalAmount: 1200,
    currency: 'AUD',
    fileKey: 'invoices/inv-1.xlsx',
    previousInvoiceId: null,
    generatedByUserId: 'op-1',
    generatedAt: new Date('2026-03-16T10:00:00.000Z'),
    paidAt: null,
    paidByUserId: null,
    paymentReference: null,
    notes: null,
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
  return new MarkInvoicePaidUseCase(invoiceRepo, auditService as any, authorizationService);
}

describe('MarkInvoicePaidUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoiceRepo.findById.mockResolvedValue(makeClosedInvoice());
    invoiceRepo.update.mockResolvedValue(undefined);
  });

  it('should mark a CLOSED invoice as PAID with default paidAt', async () => {
    const sut = makeSut();

    const result = await sut.execute({ invoiceId: 'inv-1', actor: opActor });

    expect(result.id).toBe('inv-1');
    expect(result.status).toBe('PAID');
    expect(result.paidByUserId).toBe('op-1');
    expect(result.paidAt).toBeDefined();
    expect(result.paymentReference).toBeNull();

    expect(invoiceRepo.update).toHaveBeenCalledWith('inv-1', {
      status: 'PAID',
      paidAt: expect.any(Date),
      paidByUserId: 'op-1',
      paymentReference: null,
    });
  });

  it('should accept a custom paidAt timestamp', async () => {
    const sut = makeSut();
    const customPaidAt = '2026-04-01T10:00:00.000Z';

    const result = await sut.execute({
      invoiceId: 'inv-1',
      paidAt: customPaidAt,
      actor: amActor,
    });

    expect(result.paidAt).toBe(customPaidAt);
    expect(invoiceRepo.update).toHaveBeenCalledWith('inv-1', expect.objectContaining({
      paidAt: new Date(customPaidAt),
    }));
  });

  it('should round-trip the paymentReference', async () => {
    const sut = makeSut();

    const result = await sut.execute({
      invoiceId: 'inv-1',
      paymentReference: 'BT-20260410-001',
      actor: opActor,
    });

    expect(result.paymentReference).toBe('BT-20260410-001');
    expect(invoiceRepo.update).toHaveBeenCalledWith('inv-1', expect.objectContaining({
      paymentReference: 'BT-20260410-001',
    }));
  });

  it('should record the actor userId as paidByUserId', async () => {
    const sut = makeSut();

    const result = await sut.execute({ invoiceId: 'inv-1', actor: amActor });

    expect(result.paidByUserId).toBe('am-1');
    expect(invoiceRepo.update).toHaveBeenCalledWith('inv-1', expect.objectContaining({
      paidByUserId: 'am-1',
    }));
  });

  it('should allow AM to mark invoices as paid', async () => {
    const sut = makeSut();

    const result = await sut.execute({ invoiceId: 'inv-1', actor: amActor });

    expect(result.status).toBe('PAID');
    expect(result.paidByUserId).toBe('am-1');
  });

  it('should reject non-CLOSED invoice (OPEN)', async () => {
    const sut = makeSut();
    invoiceRepo.findById.mockResolvedValue(makeClosedInvoice({ status: 'OPEN' }));

    await expect(
      sut.execute({ invoiceId: 'inv-1', actor: opActor }),
    ).rejects.toThrow(InvoiceNotClosedError);
  });

  it('should reject already PAID invoice with INVOICE_ALREADY_PAID', async () => {
    const sut = makeSut();
    invoiceRepo.findById.mockResolvedValue(makeClosedInvoice({ status: 'PAID' }));

    await expect(
      sut.execute({ invoiceId: 'inv-1', actor: opActor }),
    ).rejects.toThrow(InvoiceAlreadyPaidError);
  });

  it('should reject paidAt in the future beyond the grace window (Q4)', async () => {
    const sut = makeSut();
    // Two hours in the future — exceeds the 1h grace window
    const farFuture = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    await expect(
      sut.execute({ invoiceId: 'inv-1', paidAt: farFuture, actor: opActor }),
    ).rejects.toThrow(InvoicePaymentDateInvalidError);
  });

  it('should accept paidAt within the 1h grace window', async () => {
    const sut = makeSut();
    // 30 minutes ahead — within the grace window
    const slightlyFuture = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const result = await sut.execute({
      invoiceId: 'inv-1',
      paidAt: slightlyFuture,
      actor: opActor,
    });

    expect(result.status).toBe('PAID');
  });

  it('should reject paidAt before invoice.generatedAt', async () => {
    const sut = makeSut();
    // Invoice was generated on 2026-03-16; payment before that is invalid
    const tooEarly = '2026-03-10T00:00:00.000Z';

    await expect(
      sut.execute({ invoiceId: 'inv-1', paidAt: tooEarly, actor: opActor }),
    ).rejects.toThrow(InvoicePaymentDateInvalidError);
  });

  // Bug B-7 (QA 2026-04-18). Datetime-local pickers truncate seconds, so
  // "mark paid now" can submit a timestamp a few hundred ms before the
  // invoice's generatedAt. A 1-minute grace absorbs that without letting
  // genuinely-backdated payments through.
  it('should accept paidAt within the 1-minute truncation grace window', async () => {
    const sut = makeSut();
    const generatedAt = new Date(Date.now() - 30 * 1000); // 30s ago
    invoiceRepo.findById.mockResolvedValue(
      makeClosedInvoice({ generatedAt }),
    );
    // 45s before generatedAt — inside the 60s grace
    const slightlyEarly = new Date(generatedAt.getTime() - 45 * 1000).toISOString();

    const result = await sut.execute({
      invoiceId: 'inv-1',
      paidAt: slightlyEarly,
      actor: opActor,
    });

    expect(result.status).toBe('PAID');
  });

  it('exposes INVOICE_PAYMENT_DATE_INVALID error code (not VALIDATION_ERROR)', async () => {
    const sut = makeSut();
    const tooEarly = '2026-03-01T00:00:00.000Z'; // well before generatedAt

    try {
      await sut.execute({ invoiceId: 'inv-1', paidAt: tooEarly, actor: opActor });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvoicePaymentDateInvalidError);
      expect((err as InvoicePaymentDateInvalidError).code).toBe('INVOICE_PAYMENT_DATE_INVALID');
    }
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

  it('should reject INSP actor', async () => {
    const sut = makeSut();
    const inspActor = {
      userId: 'insp-1',
      tenantId: 'tenant-1',
      role: 'INSP' as const,
      branchId: null,
      inspectorId: 'insp-1',
    };

    await expect(
      sut.execute({ invoiceId: 'inv-1', actor: inspActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject when invoice not found', async () => {
    const sut = makeSut();
    invoiceRepo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({ invoiceId: 'nonexistent', actor: opActor }),
    ).rejects.toThrow(InvoiceNotFoundError);
  });

  it('should audit log the mark-paid action with full before/after snapshots', async () => {
    const sut = makeSut();

    await sut.execute({
      invoiceId: 'inv-1',
      paymentReference: 'BT-001',
      actor: opActor,
    });

    expect(auditService.log).toHaveBeenCalledOnce();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'invoice.marked_paid',
        actorType: 'USER',
        actorId: 'op-1',
        entityType: 'InspectorInvoice',
        entityId: 'inv-1',
        before: expect.objectContaining({
          status: 'CLOSED',
          paidAt: null,
          paidByUserId: null,
          paymentReference: null,
        }),
        after: expect.objectContaining({
          status: 'PAID',
          paidByUserId: 'op-1',
          paymentReference: 'BT-001',
        }),
      }),
    );
  });
});
