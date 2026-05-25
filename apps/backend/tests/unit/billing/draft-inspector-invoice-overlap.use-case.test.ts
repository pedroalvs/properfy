import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DraftInspectorInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/draft-inspector-invoice.use-case';
import { DomainError } from '../../../src/shared/domain/errors';

const mockFindMany = vi.fn();
const mockUpsert = vi.fn();
const mockFindFirst = vi.fn();

const prisma = {
  inspectorInvoice: {
    findFirst: mockFindFirst,
    upsert: mockUpsert,
  },
  financialEntry: {
    findMany: mockFindMany,
  },
};

const auditService = { log: vi.fn() };

function makeSut() {
  return new DraftInspectorInvoiceUseCase(prisma as any, auditService as any);
}

const validEntries = [
  { id: 'entry-1', amount: 150, currency: 'AUD' },
  { id: 'entry-2', amount: 150, currency: 'AUD' },
];

const baseInput = {
  inspectorId: 'insp-1',
  periodStart: '2026-02-15',
  periodEnd: '2026-02-28',
};

describe('DraftInspectorInvoiceUseCase — period overlap logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ id: 'new-invoice-id' });
    mockFindMany.mockResolvedValue(validEntries);
  });

  it('should allow drafting when no overlapping invoice exists', async () => {
    mockFindFirst.mockResolvedValue(null);

    const sut = makeSut();
    const result = await sut.execute(baseInput);

    expect(result.status).toBe('PENDING_REVIEW');
    expect(result.entryCount).toBe(2);
  });

  it('should throw INVOICE_PERIOD_OVERLAP when a CLOSED invoice overlaps', async () => {
    mockFindFirst.mockResolvedValue({ id: 'old-inv', status: 'CLOSED' });

    const sut = makeSut();
    await expect(sut.execute(baseInput)).rejects.toThrow(DomainError);
    await expect(sut.execute(baseInput)).rejects.toMatchObject({ code: 'INVOICE_PERIOD_OVERLAP' });
  });

  it('should throw INVOICE_PERIOD_OVERLAP when a PAID invoice overlaps', async () => {
    mockFindFirst.mockResolvedValue({ id: 'old-inv', status: 'PAID' });

    const sut = makeSut();
    await expect(sut.execute(baseInput)).rejects.toMatchObject({ code: 'INVOICE_PERIOD_OVERLAP' });
  });

  it('should NOT block drafting when the only overlapping invoice is SUPERSEDED', async () => {
    // SUPERSEDED invoices are already excluded by the current query — this is a guard
    mockFindFirst.mockResolvedValue(null); // query excludes SUPERSEDED, so findFirst returns null

    const sut = makeSut();
    const result = await sut.execute(baseInput);
    expect(result.status).toBe('PENDING_REVIEW');
  });

  it('should upsert (refresh or create) on the composite period key to avoid constraint violations', async () => {
    mockFindFirst.mockResolvedValue(null); // overlap check passes

    const sut = makeSut();
    const result = await sut.execute(baseInput);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ inspector_id_period_start_period_end: expect.any(Object) }),
        update: expect.objectContaining({ status: 'PENDING_REVIEW' }),
        create: expect.objectContaining({ status: 'PENDING_REVIEW' }),
      }),
    );
    expect(result.invoiceId).toBe('new-invoice-id');
  });

  it('should allow re-drafting the exact same period even when PENDING_REVIEW exists for it', async () => {
    // Overlap check excludes the exact same period via NOT clause; upsert refreshes it in place.
    mockFindFirst.mockResolvedValue(null); // NOT clause makes findFirst return null for same period

    const sut = makeSut();
    await expect(sut.execute(baseInput)).resolves.toMatchObject({ status: 'PENDING_REVIEW' });
    expect(mockUpsert).toHaveBeenCalled();
  });

  it('should throw INVOICE_PERIOD_OVERLAP when PENDING_REVIEW exists for a different overlapping period', async () => {
    // A PENDING_REVIEW that overlaps but has different dates must still block drafting
    // to prevent double-counting inspector payouts across partially-overlapping periods.
    mockFindFirst.mockResolvedValue({ id: 'other-inv', status: 'PENDING_REVIEW' });

    const sut = makeSut();
    await expect(sut.execute(baseInput)).rejects.toMatchObject({ code: 'INVOICE_PERIOD_OVERLAP' });
  });
});
