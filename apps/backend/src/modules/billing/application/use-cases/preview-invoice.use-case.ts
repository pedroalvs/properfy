import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import { SystemClock, type Clock } from '../../../../shared/domain/clock';
import {
  InspectorNotFoundError,
  InvoicePeriodNotAlignedError,
  InvoicePeriodNotClosedError,
} from '../../domain/billing.errors';
import { isCycleAligned, isPeriodClosed, periodEffectiveRange } from '../../domain/billing-period.service';

export interface PreviewInvoiceInput {
  inspectorId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
}

export interface PreviewInvoiceOutput {
  periodType: string;
  periodStart: string;
  periodEnd: string;
  payoutCount: number;
  totalAmount: number;
  currency: string | null;
}

/**
 * Live preview of a chosen closed period (spec 032): approved-payout count, total and currency.
 * Validates the period is cycle-aligned and closed, but does not persist anything.
 */
export class PreviewInvoiceUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(input: PreviewInvoiceInput): Promise<PreviewInvoiceOutput> {
    const { inspectorId, periodStart, periodEnd } = input;
    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector) {
      throw new InspectorNotFoundError();
    }
    const cycle = inspector.effectiveBillingCycle;

    if (!isCycleAligned(cycle, periodStart, periodEnd)) {
      throw new InvoicePeriodNotAlignedError();
    }
    if (!isPeriodClosed(periodEnd, this.clock.now())) {
      throw new InvoicePeriodNotClosedError();
    }

    const { from, to } = periodEffectiveRange(periodStart, periodEnd);
    const agg = await this.financialEntryRepo.aggregateApprovedPayoutsForInspectorInPeriod(inspectorId, from, to);

    return {
      periodType: cycle,
      periodStart,
      periodEnd,
      payoutCount: agg.count,
      totalAmount: agg.totalAmount,
      // A single currency when unambiguous; null when there are none or a mix (request enforces one).
      currency: agg.currencies.length === 1 ? (agg.currencies[0] ?? null) : null,
    };
  }
}
