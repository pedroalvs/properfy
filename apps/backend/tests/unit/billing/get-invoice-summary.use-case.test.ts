import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetInvoiceSummaryUseCase } from '../../../src/modules/billing/application/use-cases/get-invoice-summary.use-case';
import { MultiCurrencyScopeError } from '../../../src/modules/billing/domain/billing.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

const invoiceRepo = {
  getStatusAggregates: vi.fn(),
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
  return new GetInvoiceSummaryUseCase(invoiceRepo as any, authorizationService);
}

describe('GetInvoiceSummaryUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives per-status counts and pending/paid amounts', async () => {
    const sut = makeSut();
    invoiceRepo.getStatusAggregates.mockResolvedValue([
      { status: 'PENDING_REVIEW', currency: 'AUD', sumAmount: 1200.5, count: 4 },
      { status: 'CLOSED', currency: 'AUD', sumAmount: 3000, count: 3 },
      { status: 'PAID', currency: 'AUD', sumAmount: 800, count: 2 },
      { status: 'VOID', currency: 'AUD', sumAmount: 50, count: 1 },
    ]);

    const result = await sut.execute({ actor: opActor });

    expect(result).toEqual({
      currency: 'AUD',
      totalCount: 10,
      pendingCount: 4,
      approvedCount: 3, // CLOSED only
      paidCount: 2,
      voidCount: 1,
      pendingAmount: 1200.5,
      paidAmount: 800,
    });
  });

  it('returns zeros with AUD default for an empty scope', async () => {
    const sut = makeSut();
    invoiceRepo.getStatusAggregates.mockResolvedValue([]);

    const result = await sut.execute({ actor: opActor });

    expect(result).toEqual({
      currency: 'AUD',
      totalCount: 0,
      pendingCount: 0,
      approvedCount: 0,
      paidCount: 0,
      voidCount: 0,
      pendingAmount: 0,
      paidAmount: 0,
    });
  });

  it('passes all filters through to the repository (dates as day boundaries)', async () => {
    const sut = makeSut();
    invoiceRepo.getStatusAggregates.mockResolvedValue([]);

    await sut.execute({
      inspectorId: 'insp-9',
      agencyId: 'ag-1',
      branchId: 'b-1',
      fromDate: '2026-04-01',
      toDate: '2026-04-30',
      actor: opActor,
    });

    expect(invoiceRepo.getStatusAggregates).toHaveBeenCalledWith({
      inspectorId: 'insp-9',
      agencyId: 'ag-1',
      branchId: 'b-1',
      from: new Date('2026-04-01T00:00:00.000Z'),
      to: new Date('2026-04-30T23:59:59.999Z'),
    });
  });

  it('throws MultiCurrencyScopeError when scope spans multiple currencies', async () => {
    const sut = makeSut();
    invoiceRepo.getStatusAggregates.mockResolvedValue([
      { status: 'PAID', currency: 'AUD', sumAmount: 100, count: 1 },
      { status: 'CLOSED', currency: 'USD', sumAmount: 200, count: 1 },
    ]);

    await expect(sut.execute({ actor: opActor })).rejects.toThrow(MultiCurrencyScopeError);
  });

  it('allows the AM role', async () => {
    const sut = makeSut();
    invoiceRepo.getStatusAggregates.mockResolvedValue([]);

    const amActor = { ...opActor, userId: 'am-1', role: 'AM' as const, tenantId: null };
    await expect(sut.execute({ actor: amActor })).resolves.toMatchObject({ totalCount: 0 });
  });

  it('rejects non-AM/OP actors with ForbiddenError', async () => {
    const sut = makeSut();

    await expect(sut.execute({ actor: clientActor })).rejects.toThrow(ForbiddenError);
    expect(invoiceRepo.getStatusAggregates).not.toHaveBeenCalled();
  });
});
