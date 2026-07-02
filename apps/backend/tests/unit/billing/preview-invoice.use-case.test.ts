import { describe, it, expect, vi } from 'vitest';
import { PreviewInvoiceUseCase } from '../../../src/modules/billing/application/use-cases/preview-invoice.use-case';
import {
  InvoicePeriodNotAlignedError,
  InvoicePeriodNotClosedError,
} from '../../../src/modules/billing/domain/billing.errors';
import { FakeClock } from '../../helpers/fake-clock';

const NOW = new Date('2026-07-15T02:00:00.000Z');
// A closed, cycle-aligned FORTNIGHTLY period ending before 2026-07-15.
const CLOSED = { periodStart: '2026-06-29', periodEnd: '2026-07-12' };

function build(agg: { totalAmount: number; count: number; currencies: string[] }) {
  const inspectorRepo = { findById: vi.fn().mockResolvedValue({ effectiveBillingCycle: 'FORTNIGHTLY' }) } as any;
  const financialEntryRepo = {
    aggregateApprovedPayoutsForInspectorInPeriod: vi.fn().mockResolvedValue(agg),
  } as any;
  return { uc: new PreviewInvoiceUseCase(inspectorRepo, financialEntryRepo, new FakeClock(NOW)), financialEntryRepo };
}

describe('PreviewInvoiceUseCase', () => {
  it('returns live count/total/currency for a closed cycle-aligned period', async () => {
    const { uc } = build({ totalAmount: 700, count: 2, currencies: ['AUD'] });
    const result = await uc.execute({ inspectorId: 'insp-1', ...CLOSED });
    expect(result).toEqual({
      periodType: 'FORTNIGHTLY',
      periodStart: '2026-06-29',
      periodEnd: '2026-07-12',
      payoutCount: 2,
      totalAmount: 700,
      currency: 'AUD',
    });
  });

  it('reports null currency when the period has no approved payouts', async () => {
    const { uc } = build({ totalAmount: 0, count: 0, currencies: [] });
    const result = await uc.execute({ inspectorId: 'insp-1', ...CLOSED });
    expect(result.payoutCount).toBe(0);
    expect(result.currency).toBeNull();
  });

  it('rejects a period that is not cycle-aligned', async () => {
    const { uc, financialEntryRepo } = build({ totalAmount: 0, count: 0, currencies: [] });
    await expect(
      uc.execute({ inspectorId: 'insp-1', periodStart: '2026-06-30', periodEnd: '2026-07-13' }),
    ).rejects.toBeInstanceOf(InvoicePeriodNotAlignedError);
    expect(financialEntryRepo.aggregateApprovedPayoutsForInspectorInPeriod).not.toHaveBeenCalled();
  });

  it('rejects a period that is not yet closed', async () => {
    const { uc } = build({ totalAmount: 0, count: 0, currencies: [] });
    // The current fortnight (contains 2026-07-15) is aligned but not closed.
    await expect(
      uc.execute({ inspectorId: 'insp-1', periodStart: '2026-07-13', periodEnd: '2026-07-26' }),
    ).rejects.toBeInstanceOf(InvoicePeriodNotClosedError);
  });
});
