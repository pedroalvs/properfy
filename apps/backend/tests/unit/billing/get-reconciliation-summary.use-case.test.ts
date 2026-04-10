import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetReconciliationSummaryUseCase } from '../../../src/modules/billing/application/use-cases/get-reconciliation-summary.use-case';
import { MultiCurrencyScopeError } from '../../../src/modules/billing/domain/billing.errors';
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
  return new GetReconciliationSummaryUseCase(invoiceRepo, authorizationService);
}

describe('GetReconciliationSummaryUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns aggregated totals matching the sum of individual invoices', async () => {
    const sut = makeSut();
    invoiceRepo.getReconciliationAggregates.mockResolvedValue([
      { status: 'PAID', currency: 'AUD', sumAmount: 9800, count: 14 },
      { status: 'CLOSED', currency: 'AUD', sumAmount: 2700, count: 3 },
    ]);

    const result = await sut.execute({
      from: '2026-04-01',
      to: '2026-04-30',
      actor: opActor,
    });

    expect(result).toEqual({
      from: '2026-04-01',
      to: '2026-04-30',
      inspectorId: null,
      currency: 'AUD',
      totalInvoicedAmount: 12500,
      totalPaidAmount: 9800,
      totalUnpaidAmount: 2700,
      paidCount: 14,
      unpaidCount: 3,
    });

    // Invariant: invoiced = paid + unpaid
    expect(result.totalInvoicedAmount).toBe(result.totalPaidAmount + result.totalUnpaidAmount);
  });

  it('filters by generatedAt (start/end of day boundaries)', async () => {
    const sut = makeSut();
    invoiceRepo.getReconciliationAggregates.mockResolvedValue([]);

    await sut.execute({
      from: '2026-04-01',
      to: '2026-04-30',
      actor: opActor,
    });

    expect(invoiceRepo.getReconciliationAggregates).toHaveBeenCalledWith(
      expect.objectContaining({
        from: new Date('2026-04-01T00:00:00.000Z'),
        to: new Date('2026-04-30T23:59:59.999Z'),
      }),
    );
  });

  it('narrows by inspectorId when provided', async () => {
    const sut = makeSut();
    invoiceRepo.getReconciliationAggregates.mockResolvedValue([]);

    await sut.execute({
      from: '2026-04-01',
      to: '2026-04-30',
      inspectorId: 'insp-99',
      actor: opActor,
    });

    expect(invoiceRepo.getReconciliationAggregates).toHaveBeenCalledWith(
      expect.objectContaining({ inspectorId: 'insp-99' }),
    );
  });

  it('returns zeros for an empty scope', async () => {
    const sut = makeSut();
    invoiceRepo.getReconciliationAggregates.mockResolvedValue([]);

    const result = await sut.execute({
      from: '2026-04-01',
      to: '2026-04-30',
      actor: opActor,
    });

    expect(result.totalInvoicedAmount).toBe(0);
    expect(result.totalPaidAmount).toBe(0);
    expect(result.totalUnpaidAmount).toBe(0);
    expect(result.paidCount).toBe(0);
    expect(result.unpaidCount).toBe(0);
    expect(result.currency).toBe('AUD'); // default for empty scope
  });

  it('throws MultiCurrencyScopeError when the scope contains multiple currencies', async () => {
    const sut = makeSut();
    invoiceRepo.getReconciliationAggregates.mockResolvedValue([
      { status: 'PAID', currency: 'AUD', sumAmount: 1000, count: 1 },
      { status: 'CLOSED', currency: 'USD', sumAmount: 500, count: 1 },
    ]);

    await expect(
      sut.execute({ from: '2026-04-01', to: '2026-04-30', actor: opActor }),
    ).rejects.toThrow(MultiCurrencyScopeError);
  });

  it('includes the list of currencies in the MultiCurrencyScopeError', async () => {
    const sut = makeSut();
    invoiceRepo.getReconciliationAggregates.mockResolvedValue([
      { status: 'PAID', currency: 'AUD', sumAmount: 1000, count: 1 },
      { status: 'PAID', currency: 'USD', sumAmount: 500, count: 1 },
      { status: 'CLOSED', currency: 'EUR', sumAmount: 200, count: 1 },
    ]);

    try {
      await sut.execute({ from: '2026-04-01', to: '2026-04-30', actor: opActor });
      throw new Error('expected MultiCurrencyScopeError');
    } catch (err) {
      expect(err).toBeInstanceOf(MultiCurrencyScopeError);
      expect((err as MultiCurrencyScopeError).currencies).toEqual(
        expect.arrayContaining(['AUD', 'USD', 'EUR']),
      );
    }
  });

  it('rejects non-AM/OP actors with ForbiddenError', async () => {
    const sut = makeSut();

    await expect(
      sut.execute({ from: '2026-04-01', to: '2026-04-30', actor: clientActor }),
    ).rejects.toThrow(ForbiddenError);
  });
});
