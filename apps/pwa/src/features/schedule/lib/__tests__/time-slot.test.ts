import { describe, it, expect } from 'vitest';
import { formatTimeWindow, getScheduleStartDateTime } from '../time-slot';

describe('formatTimeWindow', () => {
  it('joins bare HH:mm start and end with an en-dash', () => {
    expect(formatTimeWindow('09:00', '11:00')).toBe('09:00 – 11:00');
  });
});

describe('getScheduleStartDateTime', () => {
  it('builds a valid local-time Date from a date and a bare HH:mm start', () => {
    const result = getScheduleStartDateTime('2026-03-25', '09:00');

    expect(result).toBeInstanceOf(Date);
    expect(Number.isNaN(result.getTime())).toBe(false);
    // Parsed as local time (no trailing Z), so local accessors reflect the input.
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2); // March (0-indexed)
    expect(result.getDate()).toBe(25);
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
  });
});
