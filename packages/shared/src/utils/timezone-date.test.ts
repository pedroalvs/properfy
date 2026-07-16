import { describe, it, expect } from 'vitest';
import { PLATFORM_TIMEZONE } from '../constants/timezone';
import { zonedWallTimeToUtc, endOfCivilDayInTz } from './timezone-date';

describe('PLATFORM_TIMEZONE', () => {
  it('is Australia/Sydney', () => {
    expect(PLATFORM_TIMEZONE).toBe('Australia/Sydney');
  });
});

describe('zonedWallTimeToUtc', () => {
  it('converts an AEST (+10) wall time to UTC', () => {
    expect(zonedWallTimeToUtc('2026-07-16', '14:30', PLATFORM_TIMEZONE).toISOString()).toBe(
      '2026-07-16T04:30:00.000Z',
    );
  });

  it('converts an AEDT (+11) wall time to UTC', () => {
    expect(zonedWallTimeToUtc('2026-01-15', '14:30', PLATFORM_TIMEZONE).toISOString()).toBe(
      '2026-01-15T03:30:00.000Z',
    );
  });

  it('resolves the nonexistent hour on DST start (2026-10-04 02:30 does not exist in Sydney)', () => {
    // Clocks jump 02:00 -> 03:00; the probe lands on the pre-transition offset (+10),
    // mapping to the instant that reads 03:30 AEDT.
    expect(zonedWallTimeToUtc('2026-10-04', '02:30', PLATFORM_TIMEZONE).toISOString()).toBe(
      '2026-10-03T16:30:00.000Z',
    );
  });

  it('resolves the ambiguous hour on DST end deterministically (2026-04-05 02:30 occurs twice)', () => {
    // Clocks fall back 03:00 -> 02:00; the probe picks the post-transition (+10) occurrence.
    expect(zonedWallTimeToUtc('2026-04-05', '02:30', PLATFORM_TIMEZONE).toISOString()).toBe(
      '2026-04-04T16:30:00.000Z',
    );
  });

  it('handles UTC as a passthrough', () => {
    expect(zonedWallTimeToUtc('2026-07-16', '09:00', 'UTC').toISOString()).toBe(
      '2026-07-16T09:00:00.000Z',
    );
  });

  it('rejects malformed inputs and normalized-but-invalid civil dates', () => {
    expect(() => zonedWallTimeToUtc('2026-2-30', '09:00', 'UTC')).toThrow(RangeError);
    expect(() => zonedWallTimeToUtc('2026-07-16', '9:00', 'UTC')).toThrow(RangeError);
    expect(() => zonedWallTimeToUtc('2026-02-30', '09:00', 'UTC')).toThrow(RangeError);
  });
});

describe('endOfCivilDayInTz', () => {
  it('returns 1ms before the next Sydney midnight (AEST)', () => {
    expect(endOfCivilDayInTz('2026-07-16', PLATFORM_TIMEZONE).toISOString()).toBe(
      '2026-07-16T13:59:59.999Z',
    );
  });

  it('returns 1ms before the next Sydney midnight (AEDT)', () => {
    expect(endOfCivilDayInTz('2026-01-15', PLATFORM_TIMEZONE).toISOString()).toBe(
      '2026-01-15T12:59:59.999Z',
    );
  });

  it('stays correct on the 23h DST-start day (2026-10-04)', () => {
    // Next midnight (2026-10-05 00:00 AEDT) = 2026-10-04T13:00Z.
    expect(endOfCivilDayInTz('2026-10-04', PLATFORM_TIMEZONE).toISOString()).toBe(
      '2026-10-04T12:59:59.999Z',
    );
  });

  it('stays correct on the 25h DST-end day (2026-04-05)', () => {
    // Next midnight (2026-04-06 00:00 AEST) = 2026-04-05T14:00Z.
    expect(endOfCivilDayInTz('2026-04-05', PLATFORM_TIMEZONE).toISOString()).toBe(
      '2026-04-05T13:59:59.999Z',
    );
  });
});
