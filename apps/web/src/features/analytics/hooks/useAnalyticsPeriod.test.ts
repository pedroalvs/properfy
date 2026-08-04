import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { PLATFORM_TIMEZONE, todayInTzDateString } from '@properfy/shared';
import { resolvePreset } from './useAnalyticsPeriod';

// A Wednesday in the middle of Q3.
const TODAY = '2026-07-15';

/**
 * Pinning the process timezone to Sydney is the point of this file, not a
 * detail. The first version of `resolvePreset` built `Date`s from local
 * calendar components and read `toISOString()` off them, so every boundary
 * landed a day early east of UTC. The unpinned suite passed anyway, because
 * neither CI nor a dev machine sits in Sydney — and Sydney is the only timezone
 * the product runs in.
 */
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Australia/Sydney';
});
afterAll(() => {
  process.env.TZ = originalTz;
});

describe('resolvePreset', () => {
  it('runs this-month from the first of the month to today', () => {
    expect(resolvePreset('this-month', TODAY)).toEqual({ startDate: '2026-07-01', endDate: '2026-07-15' });
  });

  it('makes last-30 inclusive of both ends — 30 days, not 31', () => {
    expect(resolvePreset('last-30', TODAY)).toEqual({ startDate: '2026-06-16', endDate: '2026-07-15' });
  });

  it('runs this-quarter from the first day of the calendar quarter', () => {
    expect(resolvePreset('this-quarter', TODAY)).toEqual({ startDate: '2026-07-01', endDate: '2026-07-15' });
  });

  it.each([
    ['2026-01-10', '2026-01-01'],
    ['2026-02-10', '2026-01-01'],
    ['2026-03-31', '2026-01-01'],
    ['2026-04-01', '2026-04-01'],
    ['2026-09-30', '2026-07-01'],
    ['2026-10-01', '2026-10-01'],
    ['2026-12-31', '2026-10-01'],
  ])('anchors the quarter containing %s to %s', (today, expected) => {
    expect(resolvePreset('this-quarter', today).startDate).toBe(expected);
  });

  it('does not shift the month boundary back a day on the 1st', () => {
    // The exact failure of the local-Date implementation: on the 1st in Sydney,
    // local midnight is the previous month in UTC.
    expect(resolvePreset('this-month', '2026-07-01')).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-01',
    });
  });

  it('does not shift the quarter boundary back a year on 1 January', () => {
    expect(resolvePreset('this-quarter', '2026-01-01').startDate).toBe('2026-01-01');
  });

  it('crosses a year boundary on last-30', () => {
    expect(resolvePreset('last-30', '2026-01-05')).toEqual({
      startDate: '2025-12-07',
      endDate: '2026-01-05',
    });
  });

  it('crosses a leap day on last-30', () => {
    expect(resolvePreset('last-30', '2028-03-05').startDate).toBe('2028-02-05');
  });

  it('falls back to this-month for a custom preset with no dates yet', () => {
    expect(resolvePreset('custom', TODAY)).toEqual({ startDate: '2026-07-01', endDate: '2026-07-15' });
  });

  describe('default `today`', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('resolves in the platform timezone, not UTC', () => {
      // 23:30 UTC on 14 July is already 09:30 on 15 July in Sydney. Reading the
      // UTC date off the instant — which is what the original implementation
      // did — yields the 14th, and with it a June start for "this month" on the
      // 1st. The instant is pinned because the two clocks agree for fourteen
      // hours of every day, so an unpinned assertion is only a coin flip.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-14T23:30:00.000Z'));

      expect(todayInTzDateString(PLATFORM_TIMEZONE)).toBe('2026-07-15');
      expect(new Date().toISOString().slice(0, 10)).toBe('2026-07-14');

      expect(resolvePreset('this-month')).toEqual({ startDate: '2026-07-01', endDate: '2026-07-15' });
    });

    it('does not roll the month back when Sydney has crossed into a new one', () => {
      // 23:30 UTC on 31 July is 09:30 on 1 August in Sydney: the UTC reading
      // puts the whole period in the wrong month.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-31T23:30:00.000Z'));

      expect(resolvePreset('this-month')).toEqual({ startDate: '2026-08-01', endDate: '2026-08-01' });
    });

    it('does not roll the quarter back when Sydney has crossed into a new one', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-30T23:30:00.000Z'));

      expect(resolvePreset('this-quarter').startDate).toBe('2026-10-01');
    });
  });
});
