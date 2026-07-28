import { describe, it, expect } from 'vitest';
import {
  formatDisplayDate,
  formatDisplayTime,
  formatDisplayTimeRange,
  formatDisplayTimeWindow,
  formatDisplayDateTime,
} from './format-display-date';

describe('formatDisplayDate', () => {
  describe('civil date strings (no timezone conversion)', () => {
    it('formats a bare YYYY-MM-DD as dd/mm/yyyy', () => {
      expect(formatDisplayDate('2026-07-28')).toBe('28/07/2026');
    });

    it('zero-pads single-digit days and months', () => {
      expect(formatDisplayDate('2026-01-05')).toBe('05/01/2026');
    });

    it('ignores any time suffix rather than shifting the civil day', () => {
      // A @db.Date arriving as '2026-07-28T00:00:00.000Z' must stay the 28th
      // even when the runtime timezone is behind UTC.
      expect(formatDisplayDate('2026-07-28T00:00:00.000Z')).toBe('28/07/2026');
    });

    it('does not roll the day forward for a late-evening UTC suffix', () => {
      expect(formatDisplayDate('2026-07-28T23:59:59.999Z')).toBe('28/07/2026');
    });

    it('handles a leap day', () => {
      expect(formatDisplayDate('2024-02-29')).toBe('29/02/2024');
    });
  });

  describe('Date instances (civil day in the platform timezone)', () => {
    it('formats UTC midnight as the same calendar day in Sydney', () => {
      // Sydney is ahead of UTC, so UTC midnight is mid-morning the same day.
      expect(formatDisplayDate(new Date('2026-07-28T00:00:00.000Z'))).toBe('28/07/2026');
    });

    it('rolls forward when the UTC instant is already the next day in Sydney', () => {
      // 2026-07-28T20:00Z is 2026-07-29 06:00 in Sydney (UTC+10).
      expect(formatDisplayDate(new Date('2026-07-28T20:00:00.000Z'))).toBe('29/07/2026');
    });

    it('respects daylight saving (UTC+11 in January)', () => {
      // 2026-01-14T14:00Z is 2026-01-15 01:00 in Sydney (UTC+11).
      expect(formatDisplayDate(new Date('2026-01-14T14:00:00.000Z'))).toBe('15/01/2026');
    });
  });

  describe('degenerate input', () => {
    it('returns an empty string for empty input', () => {
      expect(formatDisplayDate('')).toBe('');
    });

    it('returns an empty string for null/undefined', () => {
      expect(formatDisplayDate(null)).toBe('');
      expect(formatDisplayDate(undefined)).toBe('');
    });

    it('returns an empty string for an invalid Date', () => {
      expect(formatDisplayDate(new Date('nonsense'))).toBe('');
    });

    it('returns the raw input when the string is not a recognisable date', () => {
      expect(formatDisplayDate('not-a-date')).toBe('not-a-date');
    });

    it('returns the raw input for an impossible calendar date', () => {
      expect(formatDisplayDate('2026-02-30')).toBe('2026-02-30');
    });
  });
});

describe('formatDisplayTime', () => {
  it('formats morning times without zero-padding the hour', () => {
    expect(formatDisplayTime('09:00')).toBe('9:00 am');
  });

  it('zero-pads the minutes', () => {
    expect(formatDisplayTime('09:05')).toBe('9:05 am');
  });

  it('formats afternoon times as pm', () => {
    expect(formatDisplayTime('14:30')).toBe('2:30 pm');
  });

  it('uses a lowercase meridiem', () => {
    expect(formatDisplayTime('13:00')).toEqual(expect.stringMatching(/pm$/));
    expect(formatDisplayTime('13:00')).not.toEqual(expect.stringMatching(/PM$/));
  });

  it('never emits seconds', () => {
    expect(formatDisplayTime('09:00')).not.toContain(':00:00');
  });

  describe('12-hour boundaries', () => {
    it('renders midnight as 12:00 am', () => {
      expect(formatDisplayTime('00:00')).toBe('12:00 am');
    });

    it('renders half past midnight as 12:30 am', () => {
      expect(formatDisplayTime('00:30')).toBe('12:30 am');
    });

    it('renders noon as 12:00 pm', () => {
      expect(formatDisplayTime('12:00')).toBe('12:00 pm');
    });

    it('renders half past noon as 12:30 pm', () => {
      expect(formatDisplayTime('12:30')).toBe('12:30 pm');
    });

    it('renders one minute before noon as am', () => {
      expect(formatDisplayTime('11:59')).toBe('11:59 am');
    });

    it('renders the last minute of the day as 11:59 pm', () => {
      expect(formatDisplayTime('23:59')).toBe('11:59 pm');
    });
  });

  describe('wall-clock semantics (must NOT timezone-convert)', () => {
    it('leaves a bare HH:mm untouched by the platform timezone', () => {
      // Time slots are already Sydney wall time. Running them through a
      // timezone converter would shift them by the UTC offset.
      expect(formatDisplayTime('09:00')).toBe('9:00 am');
      expect(formatDisplayTime('17:00')).toBe('5:00 pm');
    });
  });

  describe('degenerate input', () => {
    it('returns an empty string for empty/nullish input', () => {
      expect(formatDisplayTime('')).toBe('');
      expect(formatDisplayTime(null)).toBe('');
      expect(formatDisplayTime(undefined)).toBe('');
    });

    it('returns the raw input when it is not HH:mm', () => {
      expect(formatDisplayTime('lunchtime')).toBe('lunchtime');
    });

    it('returns the raw input for an out-of-range hour', () => {
      expect(formatDisplayTime('25:00')).toBe('25:00');
    });

    it('returns the raw input for an out-of-range minute', () => {
      expect(formatDisplayTime('09:60')).toBe('09:60');
    });

    it('accepts an HH:mm:ss input but drops the seconds', () => {
      expect(formatDisplayTime('09:00:00')).toBe('9:00 am');
    });
  });
});

describe('formatDisplayTimeRange', () => {
  it('joins both ends with a spaced en-dash', () => {
    expect(formatDisplayTimeRange('09:00', '11:00')).toBe('9:00 am – 11:00 am');
  });

  it('uses U+2013 (en-dash), not a hyphen', () => {
    expect(formatDisplayTimeRange('09:00', '11:00')).toContain('\u2013');
    expect(formatDisplayTimeRange('09:00', '11:00')).not.toContain('-');
  });

  it('spans the midday boundary', () => {
    expect(formatDisplayTimeRange('08:00', '13:00')).toBe('8:00 am – 1:00 pm');
  });

  it('returns just the start when the end is missing', () => {
    expect(formatDisplayTimeRange('09:00', '')).toBe('9:00 am');
    expect(formatDisplayTimeRange('09:00', null)).toBe('9:00 am');
  });

  it('returns just the end when the start is missing', () => {
    expect(formatDisplayTimeRange('', '11:00')).toBe('11:00 am');
  });

  it('returns an empty string when both are missing', () => {
    expect(formatDisplayTimeRange('', '')).toBe('');
    expect(formatDisplayTimeRange(null, undefined)).toBe('');
  });
});

describe('formatDisplayTimeWindow', () => {
  it('parses and formats a HH:mm-HH:mm window string', () => {
    expect(formatDisplayTimeWindow('08:00-13:00')).toBe('8:00 am – 1:00 pm');
  });

  it('tolerates spaces around the separator', () => {
    expect(formatDisplayTimeWindow('08:00 - 13:00')).toBe('8:00 am – 1:00 pm');
  });

  it('tolerates an en-dash separator', () => {
    expect(formatDisplayTimeWindow('08:00 – 13:00')).toBe('8:00 am – 1:00 pm');
  });

  it('returns an empty string for empty/nullish input', () => {
    expect(formatDisplayTimeWindow('')).toBe('');
    expect(formatDisplayTimeWindow(null)).toBe('');
  });

  it('returns the raw input when it is not a window', () => {
    expect(formatDisplayTimeWindow('all day')).toBe('all day');
  });
});

describe('formatDisplayDateTime', () => {
  describe('instant semantics (MUST timezone-convert to Sydney)', () => {
    it('converts a UTC instant to Sydney wall time', () => {
      // 2026-07-28T04:12Z is 2026-07-28 14:12 in Sydney (UTC+10).
      expect(formatDisplayDateTime('2026-07-28T04:12:00.000Z')).toBe('28/07/2026, 2:12 pm');
    });

    it('applies the UTC+11 offset during daylight saving', () => {
      // 2026-01-15T00:00Z is 2026-01-15 11:00 in Sydney (UTC+11).
      expect(formatDisplayDateTime('2026-01-15T00:00:00.000Z')).toBe('15/01/2026, 11:00 am');
    });

    it('rolls the date forward when Sydney is already on the next day', () => {
      // 2026-07-28T20:00Z is 2026-07-29 06:00 in Sydney.
      expect(formatDisplayDateTime('2026-07-28T20:00:00.000Z')).toBe('29/07/2026, 6:00 am');
    });

    it('accepts a Date instance', () => {
      expect(formatDisplayDateTime(new Date('2026-07-28T04:12:00.000Z'))).toBe(
        '28/07/2026, 2:12 pm',
      );
    });
  });

  it('never emits seconds', () => {
    // The bug this replaces: toLocaleString() with no options leaked '10:00:00 am'.
    expect(formatDisplayDateTime('2026-01-15T00:00:00.000Z')).not.toMatch(/\d:\d{2}:\d{2}/);
  });

  it('uses a lowercase meridiem', () => {
    expect(formatDisplayDateTime('2026-01-15T00:00:00.000Z')).toContain('am');
    expect(formatDisplayDateTime('2026-01-15T00:00:00.000Z')).not.toContain('AM');
  });

  it('separates date and time with a comma and a space', () => {
    expect(formatDisplayDateTime('2026-01-15T00:00:00.000Z')).toBe('15/01/2026, 11:00 am');
  });

  describe('12-hour boundaries in Sydney wall time', () => {
    it('renders Sydney midnight as 12:00 am', () => {
      // 2026-07-27T14:00Z is 2026-07-28 00:00 in Sydney (UTC+10).
      expect(formatDisplayDateTime('2026-07-27T14:00:00.000Z')).toBe('28/07/2026, 12:00 am');
    });

    it('renders Sydney noon as 12:00 pm', () => {
      // 2026-07-28T02:00Z is 2026-07-28 12:00 in Sydney.
      expect(formatDisplayDateTime('2026-07-28T02:00:00.000Z')).toBe('28/07/2026, 12:00 pm');
    });
  });

  describe('degenerate input', () => {
    it('returns an empty string for empty/nullish input', () => {
      expect(formatDisplayDateTime('')).toBe('');
      expect(formatDisplayDateTime(null)).toBe('');
      expect(formatDisplayDateTime(undefined)).toBe('');
    });

    it('returns an empty string for an invalid Date', () => {
      expect(formatDisplayDateTime(new Date('nonsense'))).toBe('');
    });

    it('returns the raw input when the string is not parseable', () => {
      expect(formatDisplayDateTime('not-a-timestamp')).toBe('not-a-timestamp');
    });
  });
});
