import { SystemClock, type Clock } from '../../../../shared/domain/clock';
import type { IFinancialEntryRepository, InspectorEarningsSummary } from '../../domain/financial-entry.repository';

export interface GetInspectorEarningsSummaryInput {
  inspectorId: string;
  months: number;
}

/**
 * The inspector's own earnings summary for the PWA Earnings screen: all-time
 * approved total, pending ("next payment") total and a zero-filled last-N-months
 * approved series for the chart. The route restricts this to the authenticated
 * inspector (own-only), so no further authorization happens here.
 */
export class GetInspectorEarningsSummaryUseCase {
  constructor(
    private readonly entryRepo: IFinancialEntryRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(input: GetInspectorEarningsSummaryInput): Promise<InspectorEarningsSummary> {
    const now = this.clock.now();
    const monthlyFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (input.months - 1), 1));

    const raw = await this.entryRepo.getInspectorEarningsSummary(input.inspectorId, monthlyFrom);

    const byMonth = new Map(raw.monthly.map((m) => [m.month, m.total]));
    const monthly: { month: string; total: number }[] = [];
    for (let i = 0; i < input.months; i += 1) {
      const d = new Date(Date.UTC(monthlyFrom.getUTCFullYear(), monthlyFrom.getUTCMonth() + i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      monthly.push({ month: key, total: byMonth.get(key) ?? 0 });
    }

    return { ...raw, monthly };
  }
}
