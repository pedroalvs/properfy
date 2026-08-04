import { describe, expect, it } from 'vitest';
import { addCivilDays, mondayOf } from './local-date';

describe('mondayOf', () => {
  it('returns the same date when it is already a Monday', () => {
    expect(mondayOf('2026-07-27')).toBe('2026-07-27');
  });

  it('walks back to the Monday of the same week', () => {
    // 2026-07-27 is a Monday, so the week runs 27 Jul – 2 Aug.
    expect(mondayOf('2026-07-28')).toBe('2026-07-27'); // Tuesday
    expect(mondayOf('2026-07-30')).toBe('2026-07-27'); // Thursday
    expect(mondayOf('2026-08-01')).toBe('2026-07-27'); // Saturday
    expect(mondayOf('2026-08-02')).toBe('2026-07-27'); // Sunday — never forward
  });

  it('crosses month and year boundaries', () => {
    expect(mondayOf('2026-08-02')).toBe('2026-07-27');
    expect(mondayOf('2027-01-01')).toBe('2026-12-28');
  });

  it('handles a leap day', () => {
    // 2028-02-29 is a Tuesday.
    expect(mondayOf('2028-02-29')).toBe('2028-02-28');
  });

  it('always lands on a Monday', () => {
    for (let offset = 0; offset < 21; offset += 1) {
      const date = addCivilDays('2026-07-27', offset);
      const monday = mondayOf(date);
      expect(new Date(`${monday}T00:00:00.000Z`).getUTCDay()).toBe(1);
      expect(monday <= date).toBe(true);
    }
  });
});
