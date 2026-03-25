import { describe, expect, it } from 'vitest';
import { formatDate, toLocalISODate } from './format-date';

describe('formatDate', () => {
  it('keeps date-only strings on the same calendar day', () => {
    expect(formatDate('2026-03-01')).toBe('01/03/2026');
    expect(formatDate('2026-03-15')).toBe('15/03/2026');
  });
});

describe('toLocalISODate', () => {
  it('returns YYYY-MM-DD using local calendar fields', () => {
    expect(toLocalISODate(new Date(2026, 2, 1, 23, 30))).toBe('2026-03-01');
    expect(toLocalISODate(new Date(2026, 2, 15, 0, 5))).toBe('2026-03-15');
  });
});
