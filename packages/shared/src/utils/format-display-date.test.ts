import { describe, it, expect } from 'vitest';
import {
  formatCivilDate,
  formatWallTime,
  formatWallTimeRange,
  formatWallTimeWindow,
  formatInstantDate,
  formatInstantDateTime,
} from './format-display-date';

describe('formatCivilDate', () => {
  it('formats a bare YYYY-MM-DD as dd/mm/yyyy', () => {
    expect(formatCivilDate('2026-07-28')).toBe('28/07/2026');
  });

  it('zero-pads single-digit days and months', () => {
    // Also pins day/month ORDER: a mm/dd regression would render '01/05/2026'.
    expect(formatCivilDate('2026-01-05')).toBe('05/01/2026');
  });

  it('ignores a time suffix rather than shifting the civil day', () => {
    // A @db.Date serialised as an ISO datetime must stay the 28th.
    expect(formatCivilDate('2026-07-28T00:00:00.000Z')).toBe('28/07/2026');
    expect(formatCivilDate('2026-07-28T23:59:59.999Z')).toBe('28/07/2026');
  });

  it('handles a leap day', () => {
    expect(formatCivilDate('2024-02-29')).toBe('29/02/2024');
  });

  describe('carries no timezone (identical for every agency)', () => {
    it('is unaffected by any timezone, because a calendar day has none', () => {
      // The whole point of the civil/instant split: this value is the 28th in
      // Sydney, Perth and Auckland alike. There is no timeZone parameter to pass.
      expect(formatCivilDate('2026-07-28')).toBe('28/07/2026');
    });

    it('reads a @db.Date Date via its UTC components', () => {
      // Prisma anchors @db.Date at UTC midnight, so UTC components ARE the day.
      expect(formatCivilDate(new Date('2026-07-28T00:00:00.000Z'))).toBe('28/07/2026');
    });
  });

  describe('rejects malformed input instead of silently rendering it', () => {
    it('requires a boundary after the day', () => {
      // Regression: an unanchored pattern accepted any suffix and rendered
      // '2026-07-28garbage' as 28/07/2026, hiding corrupt data.
      expect(formatCivilDate('2026-07-28garbage')).toBe('2026-07-28garbage');
      expect(formatCivilDate('2026-07-2818:00')).toBe('2026-07-2818:00');
    });

    it('accepts a space-separated time suffix', () => {
      expect(formatCivilDate('2026-07-28 14:00')).toBe('28/07/2026');
    });

    it('returns the raw input for an impossible calendar date', () => {
      expect(formatCivilDate('2026-02-30')).toBe('2026-02-30');
    });

    it('returns the raw input when the string is not a date', () => {
      expect(formatCivilDate('not-a-date')).toBe('not-a-date');
    });
  });

  describe('degenerate input', () => {
    it('returns an empty string for empty/nullish input', () => {
      expect(formatCivilDate('')).toBe('');
      expect(formatCivilDate(null)).toBe('');
      expect(formatCivilDate(undefined)).toBe('');
    });

    it('returns an empty string for an invalid Date', () => {
      expect(formatCivilDate(new Date('nonsense'))).toBe('');
    });
  });
});

describe('formatWallTime', () => {
  it('formats morning times without zero-padding the hour', () => {
    expect(formatWallTime('09:00')).toBe('9:00 am');
  });

  it('zero-pads the minutes', () => {
    expect(formatWallTime('09:05')).toBe('9:05 am');
  });

  it('formats afternoon times as pm', () => {
    expect(formatWallTime('14:30')).toBe('2:30 pm');
  });

  it('uses a lowercase meridiem and never emits seconds', () => {
    expect(formatWallTime('13:00')).toBe('1:00 pm');
    expect(formatWallTime('13:00')).not.toMatch(/PM/);
    expect(formatWallTime('13:00')).not.toMatch(/\d:\d{2}:\d{2}/);
  });

  describe('12-hour boundaries', () => {
    it('renders midnight as 12:00 am', () => {
      expect(formatWallTime('00:00')).toBe('12:00 am');
      expect(formatWallTime('00:30')).toBe('12:30 am');
    });

    it('renders noon as 12:00 pm', () => {
      expect(formatWallTime('12:00')).toBe('12:00 pm');
      expect(formatWallTime('12:30')).toBe('12:30 pm');
    });

    it('renders the minute before noon as am and the last minute as pm', () => {
      expect(formatWallTime('11:59')).toBe('11:59 am');
      expect(formatWallTime('23:59')).toBe('11:59 pm');
    });
  });

  it('carries no timezone — the input is already local wall time', () => {
    // Converting a time slot would shift every appointment by the UTC offset.
    expect(formatWallTime('09:00')).toBe('9:00 am');
    expect(formatWallTime('17:00')).toBe('5:00 pm');
  });

  describe('degenerate input', () => {
    it('returns an empty string for empty/nullish input', () => {
      expect(formatWallTime('')).toBe('');
      expect(formatWallTime(null)).toBe('');
      expect(formatWallTime(undefined)).toBe('');
    });

    it('returns the raw input when it is not HH:mm or is out of range', () => {
      expect(formatWallTime('lunchtime')).toBe('lunchtime');
      expect(formatWallTime('25:00')).toBe('25:00');
      expect(formatWallTime('09:60')).toBe('09:60');
    });

    it('accepts HH:mm:ss but drops the seconds', () => {
      expect(formatWallTime('09:00:00')).toBe('9:00 am');
    });
  });
});

describe('formatWallTimeRange', () => {
  it('joins both ends with a spaced en-dash', () => {
    expect(formatWallTimeRange('09:00', '11:00')).toBe('9:00 am – 11:00 am');
  });

  it('uses U+2013 (en-dash), not a hyphen', () => {
    expect(formatWallTimeRange('09:00', '11:00')).toContain('\u2013');
    expect(formatWallTimeRange('09:00', '11:00')).not.toContain('-');
  });

  it('spans the midday boundary', () => {
    expect(formatWallTimeRange('08:00', '13:00')).toBe('8:00 am – 1:00 pm');
  });

  it('returns a single end alone rather than a dangling separator', () => {
    expect(formatWallTimeRange('09:00', '')).toBe('9:00 am');
    expect(formatWallTimeRange('09:00', null)).toBe('9:00 am');
    expect(formatWallTimeRange('', '11:00')).toBe('11:00 am');
  });

  it('returns an empty string when both are missing', () => {
    expect(formatWallTimeRange('', '')).toBe('');
    expect(formatWallTimeRange(null, undefined)).toBe('');
  });
});

describe('formatWallTimeWindow', () => {
  it('parses and formats a HH:mm-HH:mm window string', () => {
    expect(formatWallTimeWindow('08:00-13:00')).toBe('8:00 am – 1:00 pm');
  });

  it('tolerates spaces and an en-dash separator', () => {
    expect(formatWallTimeWindow('08:00 - 13:00')).toBe('8:00 am – 1:00 pm');
    expect(formatWallTimeWindow('08:00 – 13:00')).toBe('8:00 am – 1:00 pm');
  });

  describe('never emits a half-formatted result', () => {
    // Regression: the previous guard only detected the both-sides-fail case, so
    // one-sided failures leaked a mix of formatted and raw text, and inputs like
    // 'foo-' were silently truncated.
    it('returns the raw input when only the end fails to parse', () => {
      expect(formatWallTimeWindow('08:00-lunch')).toBe('08:00-lunch');
    });

    it('returns the raw input when only the start fails to parse', () => {
      expect(formatWallTimeWindow('lunch-13:00')).toBe('lunch-13:00');
    });

    it('does not truncate an input with a missing end', () => {
      expect(formatWallTimeWindow('foo-')).toBe('foo-');
    });

    it('does not drop content from an input with a missing start', () => {
      expect(formatWallTimeWindow('-13:00')).toBe('-13:00');
    });
  });

  it('is idempotent — re-formatting an already-formatted window is a no-op', () => {
    expect(formatWallTimeWindow('9:00 am – 1:00 pm')).toBe('9:00 am – 1:00 pm');
  });

  it('returns the raw input when it is not a window', () => {
    expect(formatWallTimeWindow('all day')).toBe('all day');
  });

  it('returns an empty string for empty/nullish input', () => {
    expect(formatWallTimeWindow('')).toBe('');
    expect(formatWallTimeWindow(null)).toBe('');
  });
});

describe('formatInstantDate', () => {
  it('resolves the calendar day in the platform timezone by default', () => {
    // 2026-07-28T20:00Z is 2026-07-29 06:00 in Sydney (UTC+10).
    expect(formatInstantDate('2026-07-28T20:00:00.000Z')).toBe('29/07/2026');
  });

  it('applies the UTC+11 offset during daylight saving', () => {
    // 2026-01-14T14:00Z is 2026-01-15 01:00 in Sydney (UTC+11).
    expect(formatInstantDate('2026-01-14T14:00:00.000Z')).toBe('15/01/2026');
  });

  describe('a string and a Date for the same instant agree', () => {
    // The regression that motivated splitting civil from instant: the previous
    // polymorphic formatter rendered these as two different days, and frontends
    // always hold the string form because API data arrives as JSON.
    const iso = '2026-07-28T20:00:00.000Z';

    it('gives the same result for both input types', () => {
      expect(formatInstantDate(iso)).toBe(formatInstantDate(new Date(iso)));
      expect(formatInstantDate(iso)).toBe('29/07/2026');
    });
  });

  describe('honours an explicit timezone (multi-agency support)', () => {
    const iso = '2026-07-28T20:00:00.000Z';

    it('renders the same instant on different days in different zones', () => {
      expect(formatInstantDate(iso, 'Australia/Sydney')).toBe('29/07/2026');
      expect(formatInstantDate(iso, 'Australia/Perth')).toBe('29/07/2026');
      expect(formatInstantDate(iso, 'UTC')).toBe('28/07/2026');
      expect(formatInstantDate(iso, 'America/New_York')).toBe('28/07/2026');
    });
  });

  describe('an unusable timezone falls back instead of throwing', () => {
    // timeZone is a parameter meant to carry a per-agency setting, and
    // Intl.DateTimeFormat throws RangeError on a malformed zone. These run in
    // render paths, so a bad config value must not take down the tree.
    const iso = '2026-07-28T20:00:00.000Z';

    it('does not throw on a malformed zone', () => {
      expect(() => formatInstantDate(iso, 'Australia/Sydne')).not.toThrow();
      expect(() => formatInstantDateTime(iso, 'Not/AZone')).not.toThrow();
    });

    it('falls back to the platform timezone', () => {
      expect(formatInstantDate(iso, 'Australia/Sydne')).toBe(formatInstantDate(iso));
      expect(formatInstantDateTime(iso, 'Not/AZone')).toBe(formatInstantDateTime(iso));
    });

    it('still honours a valid zone after a bad one was seen', () => {
      // The bad key is cached separately, so it must not poison the good one.
      formatInstantDate(iso, 'Not/AZone');
      expect(formatInstantDate(iso, 'UTC')).toBe('28/07/2026');
    });
  });

  describe('degenerate input', () => {
    it('returns an empty string for empty/nullish input', () => {
      expect(formatInstantDate('')).toBe('');
      expect(formatInstantDate(null)).toBe('');
      expect(formatInstantDate(undefined)).toBe('');
    });

    it('returns an empty string for an invalid Date and echoes a bad string', () => {
      expect(formatInstantDate(new Date('nonsense'))).toBe('');
      expect(formatInstantDate('not-a-timestamp')).toBe('not-a-timestamp');
    });
  });
});

describe('formatInstantDateTime', () => {
  it('converts a UTC instant to platform wall time', () => {
    // 2026-07-28T04:12Z is 2026-07-28 14:12 in Sydney (UTC+10).
    expect(formatInstantDateTime('2026-07-28T04:12:00.000Z')).toBe('28/07/2026, 2:12 pm');
  });

  it('applies the UTC+11 offset during daylight saving', () => {
    expect(formatInstantDateTime('2026-01-15T00:00:00.000Z')).toBe('15/01/2026, 11:00 am');
  });

  it('rolls the date forward when the zone is already on the next day', () => {
    expect(formatInstantDateTime('2026-07-28T20:00:00.000Z')).toBe('29/07/2026, 6:00 am');
  });

  it('accepts a Date and agrees with the equivalent string', () => {
    const iso = '2026-07-28T04:12:00.000Z';
    expect(formatInstantDateTime(new Date(iso))).toBe(formatInstantDateTime(iso));
  });

  it('never emits seconds', () => {
    // The bug this replaces: toLocaleString() with no options leaked '10:00:00 am'.
    expect(formatInstantDateTime('2026-01-15T00:00:00.000Z')).not.toMatch(/\d:\d{2}:\d{2}/);
  });

  it('uses a lowercase meridiem and a comma separator', () => {
    expect(formatInstantDateTime('2026-01-15T00:00:00.000Z')).toBe('15/01/2026, 11:00 am');
  });

  describe('12-hour boundaries in zoned wall time', () => {
    it('renders zone midnight as 12:00 am', () => {
      // 2026-07-27T14:00Z is 2026-07-28 00:00 in Sydney (UTC+10).
      expect(formatInstantDateTime('2026-07-27T14:00:00.000Z')).toBe('28/07/2026, 12:00 am');
    });

    it('renders zone noon as 12:00 pm', () => {
      expect(formatInstantDateTime('2026-07-28T02:00:00.000Z')).toBe('28/07/2026, 12:00 pm');
    });
  });

  it('honours an explicit timezone', () => {
    const iso = '2026-07-28T04:12:00.000Z';
    expect(formatInstantDateTime(iso, 'UTC')).toBe('28/07/2026, 4:12 am');
    expect(formatInstantDateTime(iso, 'Australia/Perth')).toBe('28/07/2026, 12:12 pm');
  });

  describe('degenerate input', () => {
    it('returns an empty string for empty/nullish input', () => {
      expect(formatInstantDateTime('')).toBe('');
      expect(formatInstantDateTime(null)).toBe('');
      expect(formatInstantDateTime(undefined)).toBe('');
    });

    it('returns an empty string for an invalid Date and echoes a bad string', () => {
      expect(formatInstantDateTime(new Date('nonsense'))).toBe('');
      expect(formatInstantDateTime('not-a-timestamp')).toBe('not-a-timestamp');
    });
  });
});
