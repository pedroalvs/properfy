import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchMarkInvoicesPaidUseCase } from '../../../src/modules/billing/application/use-cases/batch-mark-invoices-paid.use-case';
import { InspectorInvoiceEntity } from '../../../src/modules/billing/domain/inspector-invoice.entity';
import { InvoicePaymentDateInvalidError } from '../../../src/modules/billing/domain/billing.errors';
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

function makeInvoice(id: string, overrides: Record<string, unknown> = {}) {
  return new InspectorInvoiceEntity({
    id,
    inspectorId: 'insp-1',
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-03-15'),
    periodType: 'FORTNIGHTLY',
    status: 'CLOSED',
    totalAmount: 1000,
    currency: 'AUD',
    fileKey: null,
    previousInvoiceId: null,
    generatedByUserId: 'op-1',
    issuedAt: new Date('2026-03-16T10:00:00.000Z'),
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

const clientActor = {
  userId: 'cl-1',
  tenantId: 'tenant-1',
  role: 'CL_ADMIN' as const,
  branchId: null,
  inspectorId: null,
};

const authorizationService = new AuthorizationService(auditService as any);

function makeSut() {
  return new BatchMarkInvoicesPaidUseCase(invoiceRepo, auditService as any, authorizationService);
}

describe('BatchMarkInvoicesPaidUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoiceRepo.update.mockResolvedValue(undefined);
  });

  it('processes all CLOSED invoices and returns an empty skipped list (happy path)', async () => {
    const sut = makeSut();
    invoiceRepo.findManyByIds.mockResolvedValue([
      makeInvoice('inv-1'),
      makeInvoice('inv-2'),
      makeInvoice('inv-3'),
    ]);

    const result = await sut.execute({
      invoiceIds: ['inv-1', 'inv-2', 'inv-3'],
      paymentReference: 'BATCH-001',
      actor: opActor,
    });

    expect(result.processed).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
    expect(invoiceRepo.update).toHaveBeenCalledTimes(3);
    expect(auditService.log).toHaveBeenCalledTimes(3);
  });

  it('skips already-paid invoices without failing the batch', async () => {
    const sut = makeSut();
    invoiceRepo.findManyByIds.mockResolvedValue([
      makeInvoice('inv-1'),
      makeInvoice('inv-2', { status: 'PAID' }),
      makeInvoice('inv-3'),
    ]);

    const result = await sut.execute({
      invoiceIds: ['inv-1', 'inv-2', 'inv-3'],
      actor: opActor,
    });

    expect(result.processed.map((p) => p.id)).toEqual(['inv-1', 'inv-3']);
    expect(result.skipped).toEqual([{ id: 'inv-2', reason: 'ALREADY_PAID' }]);
    expect(invoiceRepo.update).toHaveBeenCalledTimes(2);
    expect(auditService.log).toHaveBeenCalledTimes(2);
  });

  it('skips non-CLOSED (OPEN) invoices with NOT_CLOSED reason', async () => {
    const sut = makeSut();
    invoiceRepo.findManyByIds.mockResolvedValue([
      makeInvoice('inv-1'),
      makeInvoice('inv-2', { status: 'OPEN' }),
    ]);

    const result = await sut.execute({
      invoiceIds: ['inv-1', 'inv-2'],
      actor: opActor,
    });

    expect(result.processed).toHaveLength(1);
    expect(result.skipped).toEqual([{ id: 'inv-2', reason: 'NOT_CLOSED' }]);
  });

  it('skips missing invoices with NOT_FOUND reason', async () => {
    const sut = makeSut();
    invoiceRepo.findManyByIds.mockResolvedValue([makeInvoice('inv-1')]);

    const result = await sut.execute({
      invoiceIds: ['inv-1', 'missing-id'],
      actor: opActor,
    });

    expect(result.processed).toHaveLength(1);
    expect(result.skipped).toEqual([{ id: 'missing-id', reason: 'NOT_FOUND' }]);
  });

  it('returns 200 with empty processed when all invoices are already paid', async () => {
    const sut = makeSut();
    invoiceRepo.findManyByIds.mockResolvedValue([
      makeInvoice('inv-1', { status: 'PAID' }),
      makeInvoice('inv-2', { status: 'PAID' }),
    ]);

    const result = await sut.execute({
      invoiceIds: ['inv-1', 'inv-2'],
      actor: opActor,
    });

    expect(result.processed).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
    expect(invoiceRepo.update).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('produces exactly one audit record per processed invoice (FR-009)', async () => {
    const sut = makeSut();
    invoiceRepo.findManyByIds.mockResolvedValue([
      makeInvoice('inv-1'),
      makeInvoice('inv-2'),
      makeInvoice('inv-3'),
      makeInvoice('inv-4'),
      makeInvoice('inv-5'),
    ]);

    await sut.execute({
      invoiceIds: ['inv-1', 'inv-2', 'inv-3', 'inv-4', 'inv-5'],
      actor: opActor,
    });

    // 5 processed → exactly 5 audit records (not 1, not 6)
    expect(auditService.log).toHaveBeenCalledTimes(5);
    // Verify each is a distinct mark_paid event
    const calls = (auditService.log as any).mock.calls;
    const entityIds = calls.map((c: any[]) => c[0].entityId).sort();
    expect(entityIds).toEqual(['inv-1', 'inv-2', 'inv-3', 'inv-4', 'inv-5']);
  });

  it('shares the same paidAt and paymentReference across all processed invoices', async () => {
    const sut = makeSut();
    invoiceRepo.findManyByIds.mockResolvedValue([
      makeInvoice('inv-1'),
      makeInvoice('inv-2'),
    ]);

    const sharedPaidAt = '2026-04-05T12:00:00.000Z';
    await sut.execute({
      invoiceIds: ['inv-1', 'inv-2'],
      paidAt: sharedPaidAt,
      paymentReference: 'SHARED-REF',
      actor: opActor,
    });

    const updateCalls = (invoiceRepo.update as any).mock.calls;
    expect(updateCalls).toHaveLength(2);
    for (const call of updateCalls) {
      expect(call[1]).toMatchObject({
        paidAt: new Date(sharedPaidAt),
        paymentReference: 'SHARED-REF',
      });
    }
  });

  it('rejects non-AM/OP actors with ForbiddenError', async () => {
    const sut = makeSut();

    await expect(
      sut.execute({ invoiceIds: ['inv-1'], actor: clientActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects paidAt beyond the 1h future grace window', async () => {
    const sut = makeSut();
    const farFuture = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    await expect(
      sut.execute({ invoiceIds: ['inv-1'], paidAt: farFuture, actor: opActor }),
    ).rejects.toThrow(InvoicePaymentDateInvalidError);
  });
});
