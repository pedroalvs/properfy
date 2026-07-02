import { describe, it, expect } from 'vitest';
import {
  computeClosedPeriods,
  getCanonicalPeriod,
  isCycleAligned,
  isPeriodClosed,
} from '../../../src/modules/billing/domain/billing-period.service';

// A fixed instant: 2026-07-15 12:00 in Australia/Sydney (AEST, UTC+10) → civil date 2026-07-15 (a Wednesday).
const NOW = new Date('2026-07-15T02:00:00.000Z');

describe('getCanonicalPeriod', () => {
  it('WEEKLY: Monday–Sunday week containing the date', () => {
    expect(getCanonicalPeriod('WEEKLY', '2026-07-15')).toEqual({
      periodType: 'WEEKLY',
      periodStart: '2026-07-13',
      periodEnd: '2026-07-19',
    });
    // a Monday maps to its own week start
    expect(getCanonicalPeriod('WEEKLY', '2024-01-01')).toEqual({
      periodType: 'WEEKLY',
      periodStart: '2024-01-01',
      periodEnd: '2024-01-07',
    });
  });

  it('FORTNIGHTLY: 14-day block anchored at the 2024-01-01 epoch Monday', () => {
    expect(getCanonicalPeriod('FORTNIGHTLY', '2026-07-15')).toEqual({
      periodType: 'FORTNIGHTLY',
      periodStart: '2026-07-13',
      periodEnd: '2026-07-26',
    });
    expect(getCanonicalPeriod('FORTNIGHTLY', '2024-01-01')).toEqual({
      periodType: 'FORTNIGHTLY',
      periodStart: '2024-01-01',
      periodEnd: '2024-01-14',
    });
  });

  it('MONTHLY: calendar month', () => {
    expect(getCanonicalPeriod('MONTHLY', '2026-07-15')).toEqual({
      periodType: 'MONTHLY',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });
    // February in a non-leap year
    expect(getCanonicalPeriod('MONTHLY', '2026-02-10').periodEnd).toBe('2026-02-28');
    // February in a leap year
    expect(getCanonicalPeriod('MONTHLY', '2024-02-10').periodEnd).toBe('2024-02-29');
  });
});

describe('isCycleAligned', () => {
  it('accepts exact canonical boundaries', () => {
    expect(isCycleAligned('WEEKLY', '2026-07-06', '2026-07-12')).toBe(true);
    expect(isCycleAligned('FORTNIGHTLY', '2026-06-29', '2026-07-12')).toBe(true);
    expect(isCycleAligned('MONTHLY', '2026-06-01', '2026-06-30')).toBe(true);
  });

  it('rejects wrong end date', () => {
    expect(isCycleAligned('WEEKLY', '2026-07-06', '2026-07-11')).toBe(false);
  });

  it('rejects non-anchored start', () => {
    expect(isCycleAligned('WEEKLY', '2026-07-07', '2026-07-13')).toBe(false);
    expect(isCycleAligned('FORTNIGHTLY', '2026-07-06', '2026-07-19')).toBe(false);
  });
});

describe('isPeriodClosed', () => {
  it('is closed when the period end is before today (Australia/Sydney)', () => {
    expect(isPeriodClosed('2026-07-12', NOW)).toBe(true);
  });
  it('is not closed when the period end is today or in the future', () => {
    expect(isPeriodClosed('2026-07-15', NOW)).toBe(false);
    expect(isPeriodClosed('2026-07-19', NOW)).toBe(false);
  });
  it('resolves "today" in the platform timezone, not UTC', () => {
    // 2026-07-14 23:00 UTC is already 2026-07-15 09:00 in Sydney.
    const lateUtc = new Date('2026-07-14T23:00:00.000Z');
    expect(isPeriodClosed('2026-07-14', lateUtc)).toBe(true);
    expect(isPeriodClosed('2026-07-15', lateUtc)).toBe(false);
  });
});

describe('computeClosedPeriods', () => {
  it('WEEKLY: most recent closed weeks, newest first, excluding the in-progress week', () => {
    expect(computeClosedPeriods('WEEKLY', NOW, 2)).toEqual([
      { periodType: 'WEEKLY', periodStart: '2026-07-06', periodEnd: '2026-07-12' },
      { periodType: 'WEEKLY', periodStart: '2026-06-29', periodEnd: '2026-07-05' },
    ]);
  });

  it('FORTNIGHTLY: most recent closed fortnights', () => {
    expect(computeClosedPeriods('FORTNIGHTLY', NOW, 2)).toEqual([
      { periodType: 'FORTNIGHTLY', periodStart: '2026-06-29', periodEnd: '2026-07-12' },
      { periodType: 'FORTNIGHTLY', periodStart: '2026-06-15', periodEnd: '2026-06-28' },
    ]);
  });

  it('MONTHLY: most recent closed months', () => {
    expect(computeClosedPeriods('MONTHLY', NOW, 2)).toEqual([
      { periodType: 'MONTHLY', periodStart: '2026-06-01', periodEnd: '2026-06-30' },
      { periodType: 'MONTHLY', periodStart: '2026-05-01', periodEnd: '2026-05-31' },
    ]);
  });

  it('never returns future or in-progress periods', () => {
    const periods = computeClosedPeriods('MONTHLY', NOW, 6);
    for (const p of periods) {
      expect(isPeriodClosed(p.periodEnd, NOW)).toBe(true);
    }
    expect(periods).toHaveLength(6);
  });
});
