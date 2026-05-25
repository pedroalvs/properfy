import { describe, it, expect } from 'vitest';
import { nextOccurrence } from '../next-day-of-week';

// Day-of-week index: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type DayKey = (typeof DAY_NAMES)[number];

function toDate(yyyy_mm_dd: string): Date {
  const [y, m, d] = yyyy_mm_dd.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

function addDays(date: Date, n: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + n);
  return result;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

describe('nextOccurrence', () => {
  describe('never returns today — skips to next week when today matches', () => {
    it.each(DAY_NAMES)('day=%s: today is the requested day → returns 7 days later', (day) => {
      const dayIndex = DAY_NAMES.indexOf(day);
      // Pick a fixed date whose getDay() matches dayIndex
      // 2026-05-24 is a Sunday (0), 2026-05-25 Mon (1), ..., 2026-05-30 Sat (6)
      const base = toDate('2026-05-24'); // Sunday
      const today = addDays(base, dayIndex);
      expect(today.getDay()).toBe(dayIndex);

      const result = nextOccurrence(day, today);
      const expected = formatDate(addDays(today, 7));
      expect(result).toBe(expected);
    });
  });

  describe('returns next future occurrence', () => {
    it('day is tomorrow — returns tomorrow', () => {
      // today is Monday (2026-05-25), requesting Tuesday
      const today = toDate('2026-05-25'); // Monday
      expect(today.getDay()).toBe(1);
      const result = nextOccurrence('tue', today);
      expect(result).toBe('2026-05-26');
    });

    it('day was yesterday — returns 6 days from now', () => {
      // today is Tuesday (2026-05-26), requesting Monday
      const today = toDate('2026-05-26'); // Tuesday
      const result = nextOccurrence('mon', today);
      expect(result).toBe('2026-06-01');
    });

    it('requesting the day 3 days away', () => {
      // today is Monday, requesting Thursday
      const today = toDate('2026-05-25'); // Monday
      const result = nextOccurrence('thu', today);
      expect(result).toBe('2026-05-28');
    });

    it('requesting Sunday from Friday — 2 days away', () => {
      const today = toDate('2026-05-29'); // Friday
      const result = nextOccurrence('sun', today);
      expect(result).toBe('2026-05-31');
    });

    it('requesting Saturday from Sunday — 6 days ahead', () => {
      const today = toDate('2026-05-24'); // Sunday
      const result = nextOccurrence('sat', today);
      expect(result).toBe('2026-05-30');
    });
  });

  describe('default from=today behavior', () => {
    it('returns a string in YYYY-MM-DD format', () => {
      const result = nextOccurrence('mon');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('result is always strictly in the future (> today)', () => {
      const today = new Date();
      const todayStr = formatDate(today);
      for (const day of DAY_NAMES) {
        const result = nextOccurrence(day);
        expect(result > todayStr).toBe(true);
      }
    });
  });
});
