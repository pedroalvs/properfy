import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DraftInspectorInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/draft-inspector-invoice.use-case';
import { DomainError } from '../../../src/shared/domain/errors';

const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

const prisma = {
  inspectorInvoice: {
    findFirst: mockFindFirst,
    create: mockCreate,
    update: mockUpdate,
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

// The use case calls findFirst twice: once for the overlap check, once for the exact-period
// lookup. Helper to program both calls.
function programFindFirst({ overlap = null, existing = null }: { overlap?: unknown; existing?: unknown }) {
  mockFindFirst.mockResolvedValueOnce(overlap).mockResolvedValueOnce(existing);
}

describe('DraftInspectorInvoiceUseCase — period overlap logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 'new-invoice-id' });
    mockUpdate.mockResolvedValue({ id: 'existing-id' });
    mockFindMany.mockResolvedValue(validEntries);
  });

  it('should allow drafting when no overlapping invoice exists', async () => {
    programFindFirst({ overlap: null, existing: null });

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
    // SUPERSEDED invoices are already excluded by the overlap query — findFirst returns null.
    programFindFirst({ overlap: null, existing: null });

    const sut = makeSut();
    const result = await sut.execute(baseInput);
    expect(result.status).toBe('PENDING_REVIEW');
  });

  it('should create a new PENDING_REVIEW row when none exists for the period', async () => {
    programFindFirst({ overlap: null, existing: null });

    const sut = makeSut();
    const result = await sut.execute(baseInput);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_REVIEW' }) }),
    );
    expect(result.invoiceId).toBe('new-invoice-id');
  });

  it('should refresh an existing row in place when one exists for the exact period', async () => {
    programFindFirst({ overlap: null, existing: { id: 'existing-id' } });

    const sut = makeSut();
    const result = await sut.execute(baseInput);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'existing-id' }, data: expect.objectContaining({ status: 'PENDING_REVIEW' }) }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.invoiceId).toBe('existing-id');
    expect(result.status).toBe('PENDING_REVIEW');
  });

  it('should throw INVOICE_PERIOD_OVERLAP when PENDING_REVIEW exists for a different overlapping period', async () => {
    mockFindFirst.mockResolvedValue({ id: 'other-inv', status: 'PENDING_REVIEW' });

    const sut = makeSut();
    await expect(sut.execute(baseInput)).rejects.toMatchObject({ code: 'INVOICE_PERIOD_OVERLAP' });
  });
});
