import { describe, it, expect } from 'vitest';
import {
  formatDriveDuration,
  formatDistance,
  formatLeg,
  formatCivilDateLong,
  greetingFor,
} from './format-route';

describe('formatDriveDuration', () => {
  it('formats sub-hour minutes', () => {
    expect(formatDriveDuration(0)).toBe('0 min');
    expect(formatDriveDuration(59)).toBe('1 min');
    expect(formatDriveDuration(2580)).toBe('43 min');
  });

  it('formats hours and minutes', () => {
    expect(formatDriveDuration(3900)).toBe('1 h 5 min');
    expect(formatDriveDuration(3600)).toBe('1 h');
  });

  it('handles degenerate input', () => {
    expect(formatDriveDuration(null)).toBe('');
    expect(formatDriveDuration(undefined)).toBe('');
    expect(formatDriveDuration(-5)).toBe('');
  });
});

describe('formatDistance', () => {
  it('formats metres and kilometres', () => {
    expect(formatDistance(650)).toBe('650 m');
    expect(formatDistance(2140)).toBe('2.1 km');
    expect(formatDistance(14200)).toBe('14.2 km');
    expect(formatDistance(1000)).toBe('1.0 km');
  });

  it('returns empty for null', () => {
    expect(formatDistance(null)).toBe('');
    expect(formatDistance(undefined)).toBe('');
  });
});

describe('formatLeg', () => {
  it('joins drive and distance', () => {
    expect(formatLeg({ travelS: 360, distanceM: 1000, waitS: 0 })).toBe('6 min drive · 1.0 km');
  });

  it('appends the wait clause when the arriving stop waits', () => {
    expect(formatLeg({ travelS: 360, distanceM: 1000, waitS: 1500 })).toBe(
      '6 min drive · 1.0 km · wait 25 min for window',
    );
  });
});

describe('formatCivilDateLong', () => {
  it('formats a civil date as weekday, day and short month', () => {
    expect(formatCivilDateLong('2026-09-18')).toBe('Friday, 18 Sept');
  });

  it('is identical regardless of the process timezone (civil date)', () => {
    // 2026-11-05 is a Thursday.
    expect(formatCivilDateLong('2026-11-05')).toBe('Thursday, 5 Nov');
  });

  it('handles degenerate input', () => {
    expect(formatCivilDateLong(null)).toBe('');
    expect(formatCivilDateLong('')).toBe('');
    expect(formatCivilDateLong('not-a-date')).toBe('not-a-date');
  });
});

describe('greetingFor', () => {
  it('derives the greeting from the zoned hour', () => {
    // 2026-11-04T20:00Z in Sydney (AEDT) is 07:00.
    expect(greetingFor('2026-11-04T20:00:00.000Z', 'Australia/Sydney')).toBe('Good morning');
    // 12:00 local.
    expect(greetingFor('2026-11-05T01:00:00.000Z', 'Australia/Sydney')).toBe('Good afternoon');
    // 18:00 local.
    expect(greetingFor('2026-11-05T07:00:00.000Z', 'Australia/Sydney')).toBe('Good evening');
  });

  it('falls back to morning for unusable input', () => {
    expect(greetingFor(null, 'Australia/Sydney')).toBe('Good morning');
    expect(greetingFor('nonsense', 'Australia/Sydney')).toBe('Good morning');
  });
});
