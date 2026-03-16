import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/download-invoice.use-case';
import type { IInspectorInvoiceRepository } from '../../../src/modules/billing/domain/inspector-invoice.repository';
import { InspectorInvoiceEntity, type InspectorInvoiceProps } from '../../../src/modules/billing/domain/inspector-invoice.entity';
import {
  InvoiceNotFoundError,
  InvoiceNotReadyError,
  InvoiceFileNotGeneratedError,
} from '../../../src/modules/billing/domain/billing.errors';
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
    fileKey: 'invoices/insp-1/invoice-1.xlsx',
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

  const useCase = new DownloadInvoiceUseCase(invoiceRepo);

  return { useCase, invoiceRepo };
}

describe('DownloadInvoiceUseCase', () => {
  let sut: ReturnType<typeof makeSut>;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = makeSut();
  });

  it('should return download URL for CLOSED invoice with file', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(makeInvoice());

    const result = await useCase.execute({
      invoiceId: 'invoice-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.downloadUrl).toBe(
      'https://stub-storage/billing-documents/invoices/insp-1/invoice-1.xlsx?token=stub-presigned-token',
    );
    expect(result.expiresAt).toBeDefined();
    // Verify expiresAt is roughly 60 minutes from now
    const expiresAt = new Date(result.expiresAt);
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThan(59 * 60 * 1000);
    expect(diffMs).toBeLessThan(61 * 60 * 1000);
  });

  it('should throw InvoiceNotReadyError for OPEN invoice', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(
      makeInvoice({ status: 'OPEN', fileKey: 'some-file.xlsx' }),
    );

    await expect(
      useCase.execute({
        invoiceId: 'invoice-1',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(InvoiceNotReadyError);
  });

  it('should throw InvoiceFileNotGeneratedError when no fileKey', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(
      makeInvoice({ status: 'CLOSED', fileKey: null }),
    );

    await expect(
      useCase.execute({
        invoiceId: 'invoice-1',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(InvoiceFileNotGeneratedError);
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

  it('should allow INSP to download own invoice', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(makeInvoice({ inspectorId: 'insp-1' }));

    const result = await useCase.execute({
      invoiceId: 'invoice-1',
      actor: makeActor({ role: 'INSP', userId: 'insp-1' }),
    });

    expect(result.downloadUrl).toContain('insp-1');
    expect(result.expiresAt).toBeDefined();
  });

  it('should throw InvoiceNotFoundError for INSP accessing other inspector invoice', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(makeInvoice({ inspectorId: 'insp-other' }));

    await expect(
      useCase.execute({
        invoiceId: 'invoice-1',
        actor: makeActor({ role: 'INSP', userId: 'insp-1' }),
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

  it('should work for PAID invoice with file', async () => {
    const { useCase, invoiceRepo } = sut;

    vi.mocked(invoiceRepo.findById).mockResolvedValue(
      makeInvoice({ status: 'PAID', fileKey: 'invoices/insp-1/invoice-1.xlsx' }),
    );

    const result = await useCase.execute({
      invoiceId: 'invoice-1',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.downloadUrl).toBeDefined();
  });
});
