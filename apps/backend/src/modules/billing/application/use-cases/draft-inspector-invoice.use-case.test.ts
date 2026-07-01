import { describe, expect, it, vi } from 'vitest';
import { DraftInspectorInvoiceUseCase } from './draft-inspector-invoice.use-case';
import { DomainError } from '../../../../shared/domain/errors';

const INSPECTOR_ID = 'insp-1';
const PERIOD_START = '2026-01-01';
const PERIOD_END = '2026-01-14';

const MOCK_ENTRIES = [
  { id: 'entry-1', amount: 100, currency: 'AUD' },
  { id: 'entry-2', amount: 50, currency: 'AUD' },
];

const MOCK_UPSERT_RESULT = { id: 'invoice-uuid-1' };

function makeAuditService() {
  return { log: vi.fn() };
}

/**
 * Builds a prisma mock where:
 * - inspectorInvoice.findFirst is called twice in the happy path:
 *     1st call = overlap check → null (no other-period overlaps)
 *     2nd call = exact-period guard → exactPeriodRow (or null if none)
 * - financialEntry.findMany → entries
 * - inspectorInvoice.upsert → upsertResult
 */
function makePrisma(exactPeriodRow: { status: string } | null) {
  return {
    inspectorInvoice: {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce(null) // overlap check → no overlap
        .mockResolvedValueOnce(exactPeriodRow), // exact-period guard
      upsert: vi.fn().mockResolvedValue(MOCK_UPSERT_RESULT),
    },
    financialEntry: {
      findMany: vi.fn().mockResolvedValue(MOCK_ENTRIES),
    },
  };
}

describe('DraftInspectorInvoiceUseCase', () => {
  const input = {
    inspectorId: INSPECTOR_ID,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
  };

  it('creates a new invoice when no existing invoice exists for the period', async () => {
    const prisma = makePrisma(null);
    const auditService = makeAuditService();
    const useCase = new DraftInspectorInvoiceUseCase(prisma as any, auditService as any);

    const result = await useCase.execute(input);

    expect(result.status).toBe('PENDING_REVIEW');
    expect(result.invoiceId).toBe(MOCK_UPSERT_RESULT.id);
    expect(result.totalAmount).toBe(150);
    expect(result.entryCount).toBe(2);
    expect(prisma.inspectorInvoice.upsert).toHaveBeenCalledOnce();
  });

  it('refreshes a PENDING_REVIEW invoice for the exact same period', async () => {
    const prisma = makePrisma({ status: 'PENDING_REVIEW' });
    const auditService = makeAuditService();
    const useCase = new DraftInspectorInvoiceUseCase(prisma as any, auditService as any);

    const result = await useCase.execute(input);

    expect(result.status).toBe('PENDING_REVIEW');
    expect(prisma.inspectorInvoice.upsert).toHaveBeenCalledOnce();
  });

  it('resets a SUPERSEDED invoice back to PENDING_REVIEW for the exact same period', async () => {
    const prisma = makePrisma({ status: 'SUPERSEDED' });
    const auditService = makeAuditService();
    const useCase = new DraftInspectorInvoiceUseCase(prisma as any, auditService as any);

    const result = await useCase.execute(input);

    expect(result.status).toBe('PENDING_REVIEW');
    expect(prisma.inspectorInvoice.upsert).toHaveBeenCalledOnce();
  });

  it('throws INVOICE_PERIOD_FINALIZED when an exact-period CLOSED invoice exists', async () => {
    const prisma = makePrisma({ status: 'CLOSED' });
    const auditService = makeAuditService();
    const useCase = new DraftInspectorInvoiceUseCase(prisma as any, auditService as any);

    await expect(useCase.execute(input)).rejects.toSatisfy(
      (err: unknown) => err instanceof DomainError && err.code === 'INVOICE_PERIOD_FINALIZED',
    );
    expect(prisma.inspectorInvoice.upsert).not.toHaveBeenCalled();
  });

  it('throws INVOICE_PERIOD_FINALIZED when an exact-period PAID invoice exists', async () => {
    const prisma = makePrisma({ status: 'PAID' });
    const auditService = makeAuditService();
    const useCase = new DraftInspectorInvoiceUseCase(prisma as any, auditService as any);

    await expect(useCase.execute(input)).rejects.toSatisfy(
      (err: unknown) => err instanceof DomainError && err.code === 'INVOICE_PERIOD_FINALIZED',
    );
    expect(prisma.inspectorInvoice.upsert).not.toHaveBeenCalled();
  });

  it('throws INVOICE_PERIOD_FINALIZED when an exact-period OPEN invoice exists', async () => {
    const prisma = makePrisma({ status: 'OPEN' });
    const auditService = makeAuditService();
    const useCase = new DraftInspectorInvoiceUseCase(prisma as any, auditService as any);

    await expect(useCase.execute(input)).rejects.toSatisfy(
      (err: unknown) => err instanceof DomainError && err.code === 'INVOICE_PERIOD_FINALIZED',
    );
    expect(prisma.inspectorInvoice.upsert).not.toHaveBeenCalled();
  });
});
