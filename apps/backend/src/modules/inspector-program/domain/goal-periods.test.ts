import { describe, expect, it } from 'vitest';
import type { BillingPeriod } from '../../billing/domain/billing-period.service';
import { buildGoal } from './__fixtures__/builders';
import {
  currentGoalPeriod,
  goalPeriodsToClose,
  goalTermsForPeriod,
  minEndsAt,
  periodsToSkipOnReactivation,
} from './goal-periods';

const pairs = (periods: BillingPeriod[]): Array<[string, string]> =>
  periods.map((p) => [p.periodStart, p.periodEnd]);

describe('goalPeriodsToClose', () => {
  it('weekly: returns the one ended period the Monday after it', () => {
    expect(pairs(goalPeriodsToClose(buildGoal(), '2026-11-09', []))).toEqual([['2026-11-02', '2026-11-08']]);
  });

  it('returns nothing on the last day of the first period', () => {
    expect(goalPeriodsToClose(buildGoal(), '2026-11-08', [])).toEqual([]);
  });

  it('catches up ended periods, skipping already-closed starts', () => {
    expect(pairs(goalPeriodsToClose(buildGoal(), '2026-11-23', ['2026-11-02']))).toEqual([
      ['2026-11-09', '2026-11-15'],
      ['2026-11-16', '2026-11-22'],
    ]);
  });

  it('stops at endsAt', () => {
    expect(pairs(goalPeriodsToClose(buildGoal({ endsAt: '2026-11-15' }), '2026-12-01', []))).toEqual([
      ['2026-11-02', '2026-11-08'],
      ['2026-11-09', '2026-11-15'],
    ]);
  });

  it('fortnightly: 2026-11-02 is a fortnight start (1036 days since epoch)', () => {
    const goal = buildGoal({ period: 'FORTNIGHTLY' });
    expect(pairs(goalPeriodsToClose(goal, '2026-11-16', []))).toEqual([['2026-11-02', '2026-11-15']]);
    expect(pairs(goalPeriodsToClose(goal, '2026-11-30', []))).toEqual([
      ['2026-11-02', '2026-11-15'],
      ['2026-11-16', '2026-11-29'],
    ]);
  });

  it('monthly', () => {
    const goal = buildGoal({ period: 'MONTHLY', startsAt: '2026-11-01' });
    expect(pairs(goalPeriodsToClose(goal, '2026-12-01', []))).toEqual([['2026-11-01', '2026-11-30']]);
  });

  it('caps the catch-up at 8 periods, oldest first', () => {
    const result = goalPeriodsToClose(buildGoal(), '2027-06-01', []);
    expect(result).toHaveLength(8);
    expect(result[0]?.periodStart).toBe('2026-11-02');
  });
});

describe('currentGoalPeriod', () => {
  it('returns the period containing today', () => {
    expect(currentGoalPeriod(buildGoal(), '2026-11-05')).toMatchObject({
      periodStart: '2026-11-02',
      periodEnd: '2026-11-08',
    });
  });
  it('is null before startsAt and after endsAt', () => {
    expect(currentGoalPeriod(buildGoal(), '2026-11-01')).toBeNull();
    expect(currentGoalPeriod(buildGoal({ endsAt: '2026-11-15' }), '2026-11-20')).toBeNull();
  });
});

describe('periodsToSkipOnReactivation', () => {
  it('skips every unclosed started period including the current one (deactivated long ago)', () => {
    const goal = buildGoal();
    expect(pairs(periodsToSkipOnReactivation(goal, '2026-12-20', ['2026-11-02'])).map((p) => p[0])).toEqual([
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
      '2026-12-07',
      '2026-12-14',
    ]);
  });

  it('skips only the current period when reactivated the next day', () => {
    expect(pairs(periodsToSkipOnReactivation(buildGoal(), '2026-11-05', [])).map((p) => p[0])).toEqual([
      '2026-11-02',
    ]);
  });

  it('respects endsAt', () => {
    const goal = buildGoal({ endsAt: '2026-11-29' });
    const starts = pairs(periodsToSkipOnReactivation(goal, '2026-12-20', [])).map((p) => p[0]);
    expect(starts[starts.length - 1]).toBe('2026-11-23');
  });

  it('is empty when the goal has not started', () => {
    expect(periodsToSkipOnReactivation(buildGoal({ startsAt: '2026-11-16' }), '2026-11-10', [])).toEqual([]);
  });
});

describe('goalTermsForPeriod', () => {
  const goal = buildGoal({
    target: 10,
    rewardAmount: 30,
    nextTarget: 12,
    nextRewardAmount: 40,
    nextEffectiveFrom: '2026-11-16',
  });
  it('uses current terms before next_effective_from', () => {
    expect(goalTermsForPeriod(goal, '2026-11-09')).toEqual({ target: 10, rewardAmount: 30 });
  });
  it('uses next terms from next_effective_from', () => {
    expect(goalTermsForPeriod(goal, '2026-11-16')).toEqual({ target: 12, rewardAmount: 40 });
  });
  it('uses current terms when there is no pending change', () => {
    expect(goalTermsForPeriod(buildGoal(), '2026-11-16')).toEqual({ target: 10, rewardAmount: 30 });
  });
});

describe('minEndsAt', () => {
  it('is the end of the current period', () => {
    expect(minEndsAt(buildGoal(), '2026-11-11')).toBe('2026-11-15');
  });
  it('is the end of the first period when the goal has not started', () => {
    expect(minEndsAt(buildGoal({ startsAt: '2026-11-16' }), '2026-11-10')).toBe('2026-11-22');
  });
});
