import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isExecutionDensityPreset } from '@properfy/shared';
import { presetRange, validateCustomRange } from './execution-density-period';

// 2026-11-03T14:30:00Z === 2026-11-04 01:30 in Sydney (UTC+11, DST) → today = 2026-11-04.
const FIXED = new Date('2026-11-03T14:30:00Z');

describe('execution-density-period', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('P1: presetRange("30d") is the last 30 inclusive Sydney days', () => {
    expect(presetRange('30d')).toEqual({ fromDate: '2026-10-06', toDate: '2026-11-04' });
  });

  it('P2: presetRange("7d")', () => {
    expect(presetRange('7d')).toEqual({ fromDate: '2026-10-29', toDate: '2026-11-04' });
  });

  it('P3: presetRange("90d")', () => {
    expect(presetRange('90d')).toEqual({ fromDate: '2026-08-07', toDate: '2026-11-04' });
  });

  it('P4: end before start', () => {
    expect(validateCustomRange('2026-10-10', '2026-10-01')).toBe(
      'End date must be on or after the start date.',
    );
  });

  it('P5: period longer than 366 days', () => {
    expect(validateCustomRange('2025-01-01', '2026-11-04')).toBe(
      'Period can’t be longer than 366 days.',
    );
  });

  it('P6: end date in the future', () => {
    expect(validateCustomRange('2026-10-01', '2026-11-05')).toBe(
      'End date can’t be in the future.',
    );
  });

  it('P7: missing a date', () => {
    expect(validateCustomRange('', '2026-11-01')).toBe('Choose a start and end date.');
  });

  it('P8: valid range returns null', () => {
    expect(validateCustomRange('2026-10-01', '2026-10-31')).toBeNull();
  });

  it('P9: presetRange reads "today" at call time (so the control must capture it in state)', () => {
    const first = presetRange('30d');
    vi.setSystemTime(new Date('2026-11-04T14:30:00Z')); // next Sydney day
    const second = presetRange('30d');
    // A fresh call advances; proving the period must be stored, not re-derived in render.
    expect(first).toEqual({ fromDate: '2026-10-06', toDate: '2026-11-04' });
    expect(second).toEqual({ fromDate: '2026-10-07', toDate: '2026-11-05' });
  });

  it('P10: presets agree with the shared isExecutionDensityPreset predicate', () => {
    for (const preset of ['7d', '30d', '90d'] as const) {
      expect(isExecutionDensityPreset(presetRange(preset), '2026-11-04')).toBe(true);
    }
  });
});
