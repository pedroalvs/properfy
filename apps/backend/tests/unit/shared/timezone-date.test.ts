import { describe, it, expect } from 'vitest';
import { startOfPlatformToday } from '../../../src/shared/domain/timezone-date';

/**
 * `scheduled_date` is a `@db.Date` pinned to UTC midnight of a Sydney civil date,
 * so "before today" comparisons must be built from the Sydney civil date — not
 * from UTC midnight of the server clock, which is a different day for part of
 * every day (Sydney runs 10–11 hours ahead of UTC).
 */
describe('startOfPlatformToday', () => {
  it('returns UTC midnight of the Sydney civil date', () => {
    // 2026-07-29T02:00Z is 12:00 on 2026-07-29 in Sydney — same civil date.
    expect(startOfPlatformToday(new Date('2026-07-29T02:00:00.000Z')).toISOString())
      .toBe('2026-07-29T00:00:00.000Z');
  });

  it('is already tomorrow in Sydney late in the UTC day', () => {
    // 2026-07-29T14:00Z is 00:00 on 2026-07-30 in Sydney (UTC+10).
    expect(startOfPlatformToday(new Date('2026-07-29T14:00:00.000Z')).toISOString())
      .toBe('2026-07-30T00:00:00.000Z');
  });

  it('handles the daylight-saving offset (UTC+11 in January)', () => {
    // 2026-01-15T13:30Z is 00:30 on 2026-01-16 in Sydney (UTC+11).
    expect(startOfPlatformToday(new Date('2026-01-15T13:30:00.000Z')).toISOString())
      .toBe('2026-01-16T00:00:00.000Z');
  });

  it('disagrees with naive UTC midnight exactly when the civil dates differ', () => {
    const instant = new Date('2026-07-29T23:00:00.000Z'); // 09:00 on the 30th in Sydney
    const naiveUtc = new Date(instant);
    naiveUtc.setUTCHours(0, 0, 0, 0);

    expect(startOfPlatformToday(instant).toISOString()).toBe('2026-07-30T00:00:00.000Z');
    expect(naiveUtc.toISOString()).toBe('2026-07-29T00:00:00.000Z');
  });
});
