import { describe, it, expect, vi } from 'vitest';
import { RequestInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/request-invoice.use-case';
import {
  InspectorNotFoundError,
  InvoiceActiveExistsError,
  InvoiceEmptyPeriodError,
  InvoiceMixedCurrencyError,
  InvoicePeriodNotAlignedError,
  InvoicePeriodNotClosedError,
} from '../../../src/modules/billing/domain/billing.errors';
import { FakeClock } from '../../helpers/fake-clock';

const NOW = new Date('2026-07-15T02:00:00.000Z');
// A closed, cycle-aligned FORTNIGHTLY period.
const CLOSED = { periodStart: '2026-06-29', periodEnd: '2026-07-12' };

interface Overrides {
  inspector?: unknown;
  agg?: { totalAmount: number; count: number; currencies: string[] };
  existingActive?: unknown;
}

function build(o: Overrides = {}) {
  const invoiceRepo = {
    findActiveByInspectorAndPeriod: vi.fn().mockResolvedValue(o.existingActive ?? null),
    save: vi.fn().mockResolvedValue(undefined),
  } as any;
  const financialEntryRepo = {
    aggregateApprovedPayoutsForInspectorInPeriod: vi
      .fn()
      .mockResolvedValue(o.agg ?? { totalAmount: 700, count: 2, currencies: ['AUD'] }),
  } as any;
  const inspectorRepo = {
    findById: vi.fn().mockResolvedValue('inspector' in o ? o.inspector : { effectiveBillingCycle: 'FORTNIGHTLY' }),
  } as any;
  const auditService = { log: vi.fn() } as any;
  const uc = new RequestInvoiceUseCase(invoiceRepo, financialEntryRepo, inspectorRepo, auditService, new FakeClock(NOW));
  return { uc, invoiceRepo, financialEntryRepo, inspectorRepo, auditService };
}

describe('RequestInvoiceUseCase', () => {
  it('creates a PENDING_REVIEW invoice for a valid closed period', async () => {
    const { uc, invoiceRepo, auditService } = build();
    const result = await uc.execute({ inspectorId: 'insp-1', ...CLOSED });

    expect(result.status).toBe('PENDING_REVIEW');
    expect(result.totalAmount).toBe(700);
    expect(result.currency).toBe('AUD');
    expect(result.payoutCount).toBe(2);
    expect(result.periodType).toBe('FORTNIGHTLY');

    expect(invoiceRepo.save).toHaveBeenCalledTimes(1);
    const saved = invoiceRepo.save.mock.calls[0][0];
    expect(saved.status).toBe('PENDING_REVIEW');
    expect(saved.invoiceNumber).toBeNull();
    expect(saved.lineItemsSnapshot).toBeNull();
    expect(saved.draftedByInspectorId).toBe('insp-1');
    // period columns stored as UTC midnight of the civil date
    expect(saved.periodStart.toISOString()).toBe('2026-06-29T00:00:00.000Z');
    expect(saved.periodEnd.toISOString()).toBe('2026-07-12T00:00:00.000Z');
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'inspector_invoice.requested' }));
  });

  it('rejects a non-cycle-aligned period before touching the ledger', async () => {
    const { uc, financialEntryRepo, invoiceRepo } = build();
    await expect(
      uc.execute({ inspectorId: 'insp-1', periodStart: '2026-06-30', periodEnd: '2026-07-13' }),
    ).rejects.toBeInstanceOf(InvoicePeriodNotAlignedError);
    expect(financialEntryRepo.aggregateApprovedPayoutsForInspectorInPeriod).not.toHaveBeenCalled();
    expect(invoiceRepo.save).not.toHaveBeenCalled();
  });

  it('rejects an open/future period', async () => {
    const { uc, invoiceRepo } = build();
    await expect(
      uc.execute({ inspectorId: 'insp-1', periodStart: '2026-07-13', periodEnd: '2026-07-26' }),
    ).rejects.toBeInstanceOf(InvoicePeriodNotClosedError);
    expect(invoiceRepo.save).not.toHaveBeenCalled();
  });

  it('rejects when there are no approved payouts', async () => {
    const { uc } = build({ agg: { totalAmount: 0, count: 0, currencies: [] } });
    await expect(uc.execute({ inspectorId: 'insp-1', ...CLOSED })).rejects.toBeInstanceOf(InvoiceEmptyPeriodError);
  });

  it('rejects when payouts span multiple currencies', async () => {
    const { uc } = build({ agg: { totalAmount: 700, count: 2, currencies: ['AUD', 'USD'] } });
    await expect(uc.execute({ inspectorId: 'insp-1', ...CLOSED })).rejects.toBeInstanceOf(InvoiceMixedCurrencyError);
  });

  it('rejects when an active invoice already exists for the period', async () => {
    const { uc, invoiceRepo } = build({ existingActive: { id: 'inv-existing' } });
    await expect(uc.execute({ inspectorId: 'insp-1', ...CLOSED })).rejects.toBeInstanceOf(InvoiceActiveExistsError);
    expect(invoiceRepo.save).not.toHaveBeenCalled();
  });

  it('throws when the inspector does not exist', async () => {
    const { uc } = build({ inspector: null });
    await expect(uc.execute({ inspectorId: 'missing', ...CLOSED })).rejects.toBeInstanceOf(InspectorNotFoundError);
  });
});
