import { describe, it, expect } from 'vitest';
import { OVERDUE_AGE_DAYS } from '@properfy/shared';
import {
  startOfOverdueAgeCutoff,
  startOfPlatformToday,
} from '../../../src/shared/domain/timezone-date';

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

/**
 * The overdue rule compares against `created_at`, which is a real instant — unlike
 * `scheduled_date`, a `@db.Date` pinned to UTC midnight. So this cutoff must be the
 * genuine INSTANT of Sydney midnight, not UTC midnight of the Sydney civil date.
 * Confusing the two shifts every comparison by the Sydney offset (10–11h).
 */
describe('startOfOverdueAgeCutoff', () => {
  it('returns the instant of Sydney midnight, OVERDUE_AGE_DAYS civil days back', () => {
    // 2026-07-29T02:00Z = 12:00 on the 29th in Sydney, so today is 2026-07-29.
    // 45 days earlier is 2026-06-14; Sydney midnight then (AEST, +10) is 14:00Z on the 13th.
    expect(startOfOverdueAgeCutoff(new Date('2026-07-29T02:00:00.000Z')).toISOString())
      .toBe('2026-06-13T14:00:00.000Z');
  });

  it('is an instant offset from UTC midnight, NOT UTC midnight itself', () => {
    const cutoff = startOfOverdueAgeCutoff(new Date('2026-07-29T02:00:00.000Z'));
    // The bug this guards: reusing startOfPlatformToday's @db.Date convention would
    // produce exactly midnight UTC, which is 10h later than Sydney midnight.
    expect(cutoff.toISOString()).not.toMatch(/T00:00:00\.000Z$/);
  });

  it('follows the Sydney civil day when UTC has not rolled over yet', () => {
    // 2026-07-29T14:00Z = 00:00 on the 30th in Sydney, so today is 2026-07-30 and the
    // cutoff moves forward a day too: 2026-06-15 Sydney midnight = 14:00Z on the 14th.
    expect(startOfOverdueAgeCutoff(new Date('2026-07-29T14:00:00.000Z')).toISOString())
      .toBe('2026-06-14T14:00:00.000Z');
  });

  it('uses the offset in effect at the cutoff date, not at "now" (DST boundary)', () => {
    // Today 2026-04-20 is AEST (+10); 45 days back is 2026-03-06, still AEDT (+11),
    // because DST ended on 2026-04-05. A single fixed offset would be an hour out.
    expect(startOfOverdueAgeCutoff(new Date('2026-04-20T02:00:00.000Z')).toISOString())
      .toBe('2026-03-05T13:00:00.000Z');
  });

  it('lands exactly OVERDUE_AGE_DAYS civil days before today', () => {
    const now = new Date('2026-07-29T02:00:00.000Z');
    const cutoffCivil = startOfOverdueAgeCutoff(now).toISOString();
    // 2026-06-13T14:00Z is 2026-06-14 in Sydney — the civil date 45 days before the 29th.
    const days =
      (Date.parse('2026-07-29T00:00:00Z') - Date.parse('2026-06-14T00:00:00Z')) / 86_400_000;
    expect(days).toBe(OVERDUE_AGE_DAYS);
    expect(cutoffCivil).toBe('2026-06-13T14:00:00.000Z');
  });
});
