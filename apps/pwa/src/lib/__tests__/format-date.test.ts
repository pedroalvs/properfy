import { describe, it, expect } from 'vitest';
import { formatCivilDate, formatInstantDate, formatInstantDateTime } from '../format-date';

describe('formatCivilDate', () => {
  it('formats a plain YYYY-MM-DD string without timezone shifting', () => {
    expect(formatCivilDate('2026-03-18')).toBe('18/03/2026');
  });

  it('tolerates the legacy YYYY-MM-DDT00:00:00.000Z form without shifting a day', () => {
    // On devices behind UTC, parsing this as an instant would render 17/03.
    expect(formatCivilDate('2026-03-18T00:00:00.000Z')).toBe('18/03/2026');
  });
});

describe('formatInstantDateTime', () => {
  it('renders a real UTC instant on the Sydney calendar day', () => {
    // 2026-01-14T23:00:00Z is 15 Jan 10:00 in Sydney (AEDT, UTC+11).
    expect(formatInstantDateTime('2026-01-14T23:00:00.000Z')).toBe('15/01/2026, 10:00 am');
  });

  it('respects Sydney standard time outside daylight saving', () => {
    // 2026-06-15T00:00:00Z is 10:00 am in Sydney (AEST, UTC+10).
    expect(formatInstantDateTime('2026-06-15T00:00:00.000Z')).toBe('15/06/2026, 10:00 am');
  });

  it('does not leak seconds', () => {
    // The previous helper used toLocaleString() with no options, so the earnings
    // ledger showed "10:00:00 am".
    expect(formatInstantDateTime('2026-01-15T00:00:00.000Z')).not.toMatch(/\d:\d{2}:\d{2}/);
  });
});

/**
 * An inspector's device can sit in any timezone, which is exactly when passing
 * the wrong kind of value shows up: a calendar day must never move, while an
 * instant must resolve against the platform timezone rather than the device's.
 */
describe('civil dates vs instants', () => {
  const lateInstant = '2026-03-10T14:00:00Z'; // 2026-03-11 01:00 in Sydney (UTC+11)

  it('resolves a late-in-the-day instant to the NEXT Sydney day', () => {
    expect(formatInstantDate(lateInstant)).toBe('11/03/2026');
  });

  it('reads the UTC day when the same value is treated as a calendar day', () => {
    expect(formatCivilDate(lateInstant)).toBe('10/03/2026');
    expect(formatCivilDate(lateInstant)).not.toBe(formatInstantDate(lateInstant));
  });
});
