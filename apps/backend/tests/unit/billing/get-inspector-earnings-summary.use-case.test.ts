import { describe, it, expect, vi } from 'vitest';
import { PLATFORM_TIMEZONE, zonedWallTimeToUtc } from '@properfy/shared';
import { GetInspectorEarningsSummaryUseCase } from '../../../src/modules/billing/application/use-cases/get-inspector-earnings-summary.use-case';
import { FakeClock } from '../../helpers/fake-clock';

const NOW = new Date('2026-07-15T02:00:00.000Z');

function entryRepoReturning(summary: unknown) {
  return { getInspectorEarningsSummary: vi.fn().mockResolvedValue(summary) } as any;
}

describe('GetInspectorEarningsSummaryUseCase', () => {
  it('returns totals and a zero-filled last-N-months series (most recent last)', async () => {
    const repo = entryRepoReturning({
      totalApproved: 1200.5,
      nextPayment: 300,
      currency: 'AUD',
      monthly: [
        { month: '2026-07', total: 200.5 },
        { month: '2026-05', total: 1000 },
      ],
    });
    const uc = new GetInspectorEarningsSummaryUseCase(repo, new FakeClock(NOW));
    const result = await uc.execute({ inspectorId: 'insp-1', months: 4 });

    expect(result.totalApproved).toBe(1200.5);
    expect(result.nextPayment).toBe(300);
    expect(result.currency).toBe('AUD');
    expect(result.monthly).toEqual([
      { month: '2026-04', total: 0 },
      { month: '2026-05', total: 1000 },
      { month: '2026-06', total: 0 },
      { month: '2026-07', total: 200.5 },
    ]);
  });

  it('passes the first day of the window to the repository', async () => {
    const repo = entryRepoReturning({ totalApproved: 0, nextPayment: 0, currency: null, monthly: [] });
    const uc = new GetInspectorEarningsSummaryUseCase(repo, new FakeClock(NOW));
    await uc.execute({ inspectorId: 'insp-1', months: 6 });

    // 6-month window ending July 2026 (Sydney calendar) starts at Sydney
    // midnight of 2026-02-01, not UTC midnight.
    expect(repo.getInspectorEarningsSummary).toHaveBeenCalledWith(
      'insp-1',
      zonedWallTimeToUtc('2026-02-01', '00:00', PLATFORM_TIMEZONE),
    );
  });

  it('returns zeros and null currency when the inspector has no payouts', async () => {
    const repo = entryRepoReturning({ totalApproved: 0, nextPayment: 0, currency: null, monthly: [] });
    const uc = new GetInspectorEarningsSummaryUseCase(repo, new FakeClock(NOW));
    const result = await uc.execute({ inspectorId: 'insp-1', months: 2 });

    expect(result).toEqual({
      totalApproved: 0,
      nextPayment: 0,
      currency: null,
      monthly: [
        { month: '2026-06', total: 0 },
        { month: '2026-07', total: 0 },
      ],
    });
  });
});
