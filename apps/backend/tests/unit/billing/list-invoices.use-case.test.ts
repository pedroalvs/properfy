import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListInvoicesUseCase } from '../../../src/modules/billing/application/use-cases/list-invoices.use-case';
import type { IInspectorInvoiceRepository } from '../../../src/modules/billing/domain/inspector-invoice.repository';
import { InspectorInvoiceEntity, type InspectorInvoiceProps } from '../../../src/modules/billing/domain/inspector-invoice.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import type { AuthContext } from '@properfy/shared';

function makeInvoice(overrides: Partial<InspectorInvoiceProps> = {}): InspectorInvoiceEntity {
  const now = new Date('2026-03-16T10:00:00Z');
  return new InspectorInvoiceEntity({
    id: 'invoice-1',
    inspectorId: 'insp-1',
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-03-15'),
    periodType: 'BIWEEKLY',
    status: 'CLOSED',
    totalAmount: 1400,
    currency: 'AUD',
    fileKey: null,
    generatedByUserId: 'user-am',
    generatedAt: now,
    paidAt: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-am',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function makeSut() {
  const invoiceRepo: IInspectorInvoiceRepository = {
    findById: vi.fn(),
    findByInspectorAndPeriod: vi.fn(),
    findOverlapping: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };

  const useCase = new ListInvoicesUseCase(invoiceRepo);

  return { useCase, invoiceRepo };
}

describe('ListInvoicesUseCase', () => {
  let sut: ReturnType<typeof makeSut>;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = makeSut();
  });

  it('should allow AM to see all invoices', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findAll).mockResolvedValue([makeInvoice()]);
    vi.mocked(invoiceRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      page: 1,
      pageSize: 10,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.data[0].id).toBe('invoice-1');
    expect(result.data[0].totalAmount).toBe(1400);
    expect(result.data[0].periodStart).toBe('2026-03-01');
    expect(result.data[0].periodEnd).toBe('2026-03-15');
    expect(result.data[0].fileKey).toBeNull();
  });

  it('should force inspectorId to own for INSP role', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findAll).mockResolvedValue([]);
    vi.mocked(invoiceRepo.count).mockResolvedValue(0);

    await useCase.execute({
      inspectorId: 'insp-other', // Should be ignored
      page: 1,
      pageSize: 10,
      actor: makeActor({ role: 'INSP', userId: 'insp-1', inspectorId: 'insp-1' }),
    });

    expect(invoiceRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ inspectorId: 'insp-1' }),
      expect.any(Object),
    );
  });

  it('should return paginated result', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findAll).mockResolvedValue([makeInvoice()]);
    vi.mocked(invoiceRepo.count).mockResolvedValue(25);

    const result = await useCase.execute({
      page: 3,
      pageSize: 5,
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.total).toBe(25);
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(5);
    expect(invoiceRepo.findAll).toHaveBeenCalledWith(
      expect.any(Object),
      { page: 3, pageSize: 5 },
    );
  });

  it('should reject CL_ADMIN role', async () => {
    const { useCase } = sut;

    await expect(
      useCase.execute({
        page: 1,
        pageSize: 10,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject CL_USER role', async () => {
    const { useCase } = sut;

    await expect(
      useCase.execute({
        page: 1,
        pageSize: 10,
        actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should allow OP to filter by inspectorId', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findAll).mockResolvedValue([]);
    vi.mocked(invoiceRepo.count).mockResolvedValue(0);

    await useCase.execute({
      inspectorId: 'insp-2',
      page: 1,
      pageSize: 10,
      actor: makeActor({ role: 'OP' }),
    });

    expect(invoiceRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ inspectorId: 'insp-2' }),
      expect.any(Object),
    );
  });

  it('should pass date filters', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findAll).mockResolvedValue([]);
    vi.mocked(invoiceRepo.count).mockResolvedValue(0);

    await useCase.execute({
      fromDate: '2026-03-01',
      toDate: '2026-03-31',
      page: 1,
      pageSize: 10,
      actor: makeActor({ role: 'AM' }),
    });

    expect(invoiceRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ fromDate: '2026-03-01', toDate: '2026-03-31' }),
      expect.any(Object),
    );
  });

  it('should return empty list when no invoices found', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findAll).mockResolvedValue([]);
    vi.mocked(invoiceRepo.count).mockResolvedValue(0);

    const result = await useCase.execute({
      page: 1,
      pageSize: 10,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
