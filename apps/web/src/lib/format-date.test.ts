import { describe, expect, it } from 'vitest';
import { formatCivilDate, formatInstantDate, formatInstantDateTime, toLocalISODate } from './format-date';

describe('formatCivilDate', () => {
  it('keeps date-only strings on the same calendar day', () => {
    expect(formatCivilDate('2026-03-01')).toBe('01/03/2026');
    expect(formatCivilDate('2026-03-15')).toBe('15/03/2026');
  });
});

/**
 * The distinction this module exists to enforce.
 *
 * `formatCivilDate` reads the UTC calendar day, which is correct for a `@db.Date`
 * (Prisma anchors those at UTC midnight) and WRONG for a timestamp: Sydney is
 * 10-11 hours ahead, so any instant from ~14:00Z onwards already belongs to the
 * next local day. Several tables previously rendered timestamps through the
 * civil path and showed users the previous day for roughly ten hours of each day.
 */
describe('civil dates vs instants', () => {
  const lateInstant = '2026-03-10T14:00:00Z'; // 2026-03-11 01:00 in Sydney (UTC+11)

  it('resolves a late-in-the-day instant to the NEXT local day', () => {
    expect(formatInstantDate(lateInstant)).toBe('11/03/2026');
  });

  it('reads the UTC day when the same value is treated as a calendar day', () => {
    // Pinning the divergence: this is why the choice of formatter matters, and
    // why timestamps must never be passed to formatCivilDate.
    expect(formatCivilDate(lateInstant)).toBe('10/03/2026');
    expect(formatCivilDate(lateInstant)).not.toBe(formatInstantDate(lateInstant));
  });

  it('agrees with the civil reading for an instant early in the UTC day', () => {
    // Before ~14:00Z the two coincide, which is exactly why the bug was easy to
    // miss: it only shows up in the last third of each UTC day.
    expect(formatInstantDate('2026-03-10T02:00:00Z')).toBe('10/03/2026');
    expect(formatCivilDate('2026-03-10T02:00:00Z')).toBe('10/03/2026');
  });
});

describe('formatInstantDateTime', () => {
  it('renders Sydney wall time in 12-hour form without seconds', () => {
    expect(formatInstantDateTime('2026-03-15T10:00:00Z')).toBe('15/03/2026, 9:00 pm');
  });
});

describe('toLocalISODate', () => {
  it('returns YYYY-MM-DD using local calendar fields', () => {
    expect(toLocalISODate(new Date(2026, 2, 1, 23, 30))).toBe('2026-03-01');
    expect(toLocalISODate(new Date(2026, 2, 15, 0, 5))).toBe('2026-03-15');
  });
});
