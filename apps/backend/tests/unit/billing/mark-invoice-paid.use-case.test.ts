import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarkInvoicePaidUseCase } from '../../../src/modules/billing/application/use-cases/mark-invoice-paid.use-case';
import { InspectorInvoiceEntity } from '../../../src/modules/billing/domain/inspector-invoice.entity';
import {
  InvoiceNotFoundError,
  InvoiceNotClosedError,
} from '../../../src/modules/billing/domain/billing.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

const invoiceRepo = {
  findById: vi.fn(),
  findByInspectorAndPeriod: vi.fn(),
  findOverlapping: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
};

const auditService = { log: vi.fn() };

function makeClosedInvoice(overrides = {}) {
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
    generatedAt: new Date(),
    paidAt: null,
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

    const result = await sut.execute({
      invoiceId: 'inv-1',
      actor: opActor,
    });

    expect(result.id).toBe('inv-1');
    expect(result.status).toBe('PAID');
    expect(result.markedBy).toBe('op-1');
    expect(result.paidAt).toBeDefined();

    expect(invoiceRepo.update).toHaveBeenCalledWith('inv-1', {
      status: 'PAID',
      paidAt: expect.any(Date),
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
    expect(invoiceRepo.update).toHaveBeenCalledWith('inv-1', {
      status: 'PAID',
      paidAt: new Date(customPaidAt),
    });
  });

  it('should allow AM to mark invoices as paid', async () => {
    const sut = makeSut();

    const result = await sut.execute({
      invoiceId: 'inv-1',
      actor: amActor,
    });

    expect(result.status).toBe('PAID');
    expect(result.markedBy).toBe('am-1');
  });

  it('should reject non-CLOSED invoice (OPEN)', async () => {
    const sut = makeSut();
    invoiceRepo.findById.mockResolvedValue(makeClosedInvoice({ status: 'OPEN' }));

    await expect(
      sut.execute({ invoiceId: 'inv-1', actor: opActor }),
    ).rejects.toThrow(InvoiceNotClosedError);
  });

  it('should reject already PAID invoice', async () => {
    const sut = makeSut();
    invoiceRepo.findById.mockResolvedValue(makeClosedInvoice({ status: 'PAID' }));

    await expect(
      sut.execute({ invoiceId: 'inv-1', actor: opActor }),
    ).rejects.toThrow(InvoiceNotClosedError);
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

  it('should audit log the mark-paid action', async () => {
    const sut = makeSut();

    await sut.execute({ invoiceId: 'inv-1', actor: opActor });

    expect(auditService.log).toHaveBeenCalledOnce();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'invoice.marked_paid',
        actorType: 'USER',
        actorId: 'op-1',
        entityType: 'InspectorInvoice',
        entityId: 'inv-1',
        before: { status: 'CLOSED' },
        after: expect.objectContaining({ status: 'PAID', markedBy: 'op-1' }),
      }),
    );
  });
});
