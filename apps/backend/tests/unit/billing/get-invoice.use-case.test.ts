import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/get-invoice.use-case';
import type { IInspectorInvoiceRepository } from '../../../src/modules/billing/domain/inspector-invoice.repository';
import { InspectorInvoiceEntity, type InspectorInvoiceProps } from '../../../src/modules/billing/domain/inspector-invoice.entity';
import { InvoiceNotFoundError } from '../../../src/modules/billing/domain/billing.errors';
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
    previousInvoiceId: null,
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

  const useCase = new GetInvoiceUseCase(invoiceRepo);

  return { useCase, invoiceRepo };
}

describe('GetInvoiceUseCase', () => {
  let sut: ReturnType<typeof makeSut>;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = makeSut();
  });

  it('should return invoice for AM', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(makeInvoice());

    const result = await useCase.execute({
      invoiceId: 'invoice-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.id).toBe('invoice-1');
    expect(result.inspectorId).toBe('insp-1');
    expect(result.periodStart).toBe('2026-03-01');
    expect(result.periodEnd).toBe('2026-03-15');
    expect(result.totalAmount).toBe(1400);
    expect(result.currency).toBe('AUD');
    expect(result.status).toBe('CLOSED');
  });

  it('should return invoice for INSP when inspectorId matches', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(makeInvoice({ inspectorId: 'insp-1' }));

    const result = await useCase.execute({
      invoiceId: 'invoice-1',
      actor: makeActor({ role: 'INSP', userId: 'insp-1', inspectorId: 'insp-1' }),
    });

    expect(result.id).toBe('invoice-1');
    expect(result.inspectorId).toBe('insp-1');
  });

  it('should throw InvoiceNotFoundError for INSP when inspectorId does not match', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(makeInvoice({ inspectorId: 'insp-other' }));

    await expect(
      useCase.execute({
        invoiceId: 'invoice-1',
        actor: makeActor({ role: 'INSP', userId: 'insp-1', inspectorId: 'insp-1' }),
      }),
    ).rejects.toThrow(InvoiceNotFoundError);
  });

  it('should throw InvoiceNotFoundError when invoice not found', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        invoiceId: 'non-existent',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(InvoiceNotFoundError);
  });

  it('should throw ForbiddenError for CL_ADMIN', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(makeInvoice());

    await expect(
      useCase.execute({
        invoiceId: 'invoice-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should return OP with full access', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(makeInvoice());

    const result = await useCase.execute({
      invoiceId: 'invoice-1',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.id).toBe('invoice-1');
  });

  it('should return all detail fields', async () => {
    const { useCase, invoiceRepo } = sut;
    const genAt = new Date('2026-03-16T10:00:00Z');
    const paidAt = new Date('2026-03-17T12:00:00Z');

    vi.mocked(invoiceRepo.findById).mockResolvedValue(
      makeInvoice({
        fileKey: 'invoices/insp-1/invoice-1.xlsx',
        generatedByUserId: 'user-am',
        generatedAt: genAt,
        paidAt,
        notes: 'Test note',
      }),
    );

    const result = await useCase.execute({
      invoiceId: 'invoice-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.fileKey).toBe('invoices/insp-1/invoice-1.xlsx');
    expect(result.generatedByUserId).toBe('user-am');
    expect(result.generatedAt).toBe(genAt.toISOString());
    expect(result.paidAt).toBe(paidAt.toISOString());
    expect(result.notes).toBe('Test note');
  });
});
