import { describe, it, expect } from 'vitest';
import {
  computeWindowRange,
  clampRangeToWindow,
  resolveMapWindowDays,
  resolveWindowTimezone,
  formatWindowLabel,
} from './map-period-window';

describe('map-period-window', () => {
  // L1/L2/L3 — computeWindowRange: from = today, to = today + N (inclusive, N days after today).
  it('L1: computeWindowRange(14, 2026-10-27)', () => {
    expect(computeWindowRange(14, '2026-10-27')).toEqual({ from: '2026-10-27', to: '2026-11-10' });
  });
  it('L2: crosses the year boundary', () => {
    expect(computeWindowRange(14, '2026-12-25')).toEqual({ from: '2026-12-25', to: '2027-01-08' });
  });
  it('L3: N=1 on a leap day, and N=90', () => {
    expect(computeWindowRange(1, '2028-02-28')).toEqual({ from: '2028-02-28', to: '2028-02-29' });
    expect(computeWindowRange(90, '2026-10-27')).toEqual({ from: '2026-10-27', to: '2027-01-25' });
  });

  // L4–L8, L11 — clampRangeToWindow (R = 2026-10-27 .. 2026-11-10).
  const R = { from: '2026-10-27', to: '2026-11-10' };
  it('L4: empty range clamps to the whole window', () => {
    expect(clampRangeToWindow({ dateFrom: '', dateTo: '' }, R)).toEqual({ dateFrom: '2026-10-27', dateTo: '2026-11-10' });
  });
  it('L5: start before the window snaps to the start', () => {
    expect(clampRangeToWindow({ dateFrom: '2026-10-01', dateTo: '2026-11-05' }, R)).toEqual({ dateFrom: '2026-10-27', dateTo: '2026-11-05' });
  });
  it('L6: end after the window snaps to the end', () => {
    expect(clampRangeToWindow({ dateFrom: '2026-10-30', dateTo: '2026-12-31' }, R)).toEqual({ dateFrom: '2026-10-30', dateTo: '2026-11-10' });
  });
  it('L7: a range inside the window is unchanged', () => {
    expect(clampRangeToWindow({ dateFrom: '2026-11-01', dateTo: '2026-11-03' }, R)).toEqual({ dateFrom: '2026-11-01', dateTo: '2026-11-03' });
  });
  it('L8: a range entirely after the window becomes the whole window', () => {
    expect(clampRangeToWindow({ dateFrom: '2026-12-01', dateTo: '2026-12-05' }, R)).toEqual({ dateFrom: '2026-10-27', dateTo: '2026-11-10' });
  });
  it('L11: an inverted range becomes the whole window', () => {
    expect(clampRangeToWindow({ dateFrom: '2026-11-08', dateTo: '2026-11-02' }, R)).toEqual({ dateFrom: '2026-10-27', dateTo: '2026-11-10' });
  });

  // L9 — resolveMapWindowDays tolerant read.
  it('L9: resolveMapWindowDays defaults on absent/invalid', () => {
    expect(resolveMapWindowDays({ mapWindowDays: 30 })).toBe(30);
    expect(resolveMapWindowDays({})).toBe(14);
    expect(resolveMapWindowDays(null)).toBe(14);
    expect(resolveMapWindowDays({ mapWindowDays: 0 })).toBe(14);
    expect(resolveMapWindowDays({ mapWindowDays: '30' })).toBe(14);
  });

  // L10 — resolveWindowTimezone.
  it('L10: resolveWindowTimezone falls back to the platform timezone', () => {
    expect(resolveWindowTimezone('Australia/Perth')).toBe('Australia/Perth');
    expect(resolveWindowTimezone('')).toBe('Australia/Sydney');
    expect(resolveWindowTimezone(null)).toBe('Australia/Sydney');
    expect(resolveWindowTimezone('Not/AZone')).toBe('Australia/Sydney');
  });

  // L12 — formatWindowLabel singular/plural.
  it('L12: formatWindowLabel', () => {
    expect(formatWindowLabel(14)).toBe('Today + 14 days');
    expect(formatWindowLabel(1)).toBe('Today + 1 day');
  });
});
