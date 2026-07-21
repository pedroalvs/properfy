import { SystemClock, type Clock } from '../../../../shared/domain/clock';
import type { IFinancialEntryRepository, InspectorEarningsSummary } from '../../domain/financial-entry.repository';
import { civilDateInTimezone, parseDateInTimezone, PLATFORM_TIMEZONE } from '../../../../shared/domain/timezone-date';

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
    // Month buckets follow the Sydney calendar: derive the current month from the
    // Sydney civil date and query from Sydney midnight of the range's first day.
    const [nowYear, nowMonth] = civilDateInTimezone(this.clock.now(), PLATFORM_TIMEZONE)
      .split('-')
      .map(Number) as [number, number];
    const startMarker = new Date(Date.UTC(nowYear, nowMonth - 1 - (input.months - 1), 1));
    const monthlyFrom = parseDateInTimezone(startMarker.toISOString().slice(0, 10), PLATFORM_TIMEZONE);

    const raw = await this.entryRepo.getInspectorEarningsSummary(input.inspectorId, monthlyFrom);

    const byMonth = new Map(raw.monthly.map((m) => [m.month, m.total]));
    const monthly: { month: string; total: number }[] = [];
    for (let i = 0; i < input.months; i += 1) {
      const d = new Date(Date.UTC(startMarker.getUTCFullYear(), startMarker.getUTCMonth() + i, 1));
      const key = d.toISOString().slice(0, 7);
      monthly.push({ month: key, total: byMonth.get(key) ?? 0 });
    }

    return { ...raw, monthly };
  }
}
