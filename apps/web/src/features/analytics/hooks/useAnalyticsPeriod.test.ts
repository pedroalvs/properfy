import { describe, it, expect } from 'vitest';
import { resolvePreset } from './useAnalyticsPeriod';

// A Wednesday in the middle of Q3.
const TODAY = new Date(2026, 6, 15);

describe('resolvePreset', () => {
  it('runs this-month from the first of the month to today', () => {
    expect(resolvePreset('this-month', TODAY)).toEqual({ startDate: '2026-07-01', endDate: '2026-07-15' });
  });

  it('makes last-30 inclusive of both ends — 30 days, not 31', () => {
    expect(resolvePreset('last-30', TODAY)).toEqual({ startDate: '2026-06-16', endDate: '2026-07-15' });
  });

  it('runs this-quarter from the first day of the calendar quarter', () => {
    expect(resolvePreset('this-quarter', TODAY)).toEqual({ startDate: '2026-07-01', endDate: '2026-07-15' });
  });

  it('anchors Q1 to January', () => {
    expect(resolvePreset('this-quarter', new Date(2026, 1, 10)).startDate).toBe('2026-01-01');
  });

  it('anchors Q4 to October', () => {
    expect(resolvePreset('this-quarter', new Date(2026, 10, 3)).startDate).toBe('2026-10-01');
  });

  it('crosses a year boundary on last-30', () => {
    expect(resolvePreset('last-30', new Date(2026, 0, 5))).toEqual({
      startDate: '2025-12-07',
      endDate: '2026-01-05',
    });
  });

  it('falls back to this-month for a custom preset with no dates yet', () => {
    expect(resolvePreset('custom', TODAY)).toEqual({ startDate: '2026-07-01', endDate: '2026-07-15' });
  });
});
