import { describe, it, expect } from 'vitest';
import { startOfTomorrowUtc, addDaysUtc, eachDayInRangeUtc } from '../availability-horizon';

describe('startOfTomorrowUtc (platform timezone = Australia/Sydney)', () => {
  it('uses the Sydney civil date, not the UTC date, near the UTC/AEST boundary', () => {
    // 2026-07-06 20:00 UTC = 2026-07-07 06:00 AEST → Sydney "today" is the 7th,
    // so tomorrow is the 8th (UTC "today" is still the 6th).
    const now = new Date('2026-07-06T20:00:00.000Z');
    expect(startOfTomorrowUtc(now).toISOString()).toBe('2026-07-08T00:00:00.000Z');
  });

  it('agrees with UTC when both calendars are on the same day', () => {
    // 2026-07-06 10:00 UTC = 2026-07-06 20:00 AEST → same civil date.
    const now = new Date('2026-07-06T10:00:00.000Z');
    expect(startOfTomorrowUtc(now).toISOString()).toBe('2026-07-07T00:00:00.000Z');
  });

  it('is correct across the AEDT (DST) spring-forward transition', () => {
    // DST starts 2026-10-04 in Sydney. 2026-10-03 15:00 UTC = 2026-10-04 02:00 AEDT.
    const now = new Date('2026-10-03T15:00:00.000Z');
    expect(startOfTomorrowUtc(now).toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });
});

describe('addDaysUtc / eachDayInRangeUtc', () => {
  it('steps calendar days in UTC regardless of DST', () => {
    const start = new Date('2026-10-03T00:00:00.000Z');
    expect(addDaysUtc(start, 2).toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });

  it('enumerates inclusive range with stable UTC day-of-week', () => {
    const from = new Date('2026-07-08T00:00:00.000Z'); // Wednesday
    const days = eachDayInRangeUtc(from, addDaysUtc(from, 6));
    expect(days).toHaveLength(7);
    expect(days[0]?.getUTCDay()).toBe(3);
    expect(days[6]?.getUTCDay()).toBe(2);
    expect(days[6]?.toISOString()).toBe('2026-07-14T00:00:00.000Z');
  });
});
