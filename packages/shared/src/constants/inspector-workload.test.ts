import { describe, expect, it } from 'vitest';
import {
  DAILY_WORKLOAD_THRESHOLDS,
  INSPECTOR_DAILY_BUSY_THRESHOLD,
  INSPECTOR_DAILY_OVERLOAD_THRESHOLD,
  INSPECTOR_WEEKLY_BUSY_THRESHOLD,
  INSPECTOR_WEEKLY_OVERLOAD_THRESHOLD,
  WEEKLY_WORKLOAD_THRESHOLDS,
  workloadAlertLevel,
  workloadLevel,
} from './inspector-workload';

describe('workloadLevel', () => {
  it('classifies weekly totals inclusively at each threshold', () => {
    expect(workloadLevel(0)).toBe('normal');
    expect(workloadLevel(14)).toBe('normal');
    // The boundary is the whole point: 15 is already busy, 18 is already overloaded.
    expect(workloadLevel(15)).toBe('busy');
    expect(workloadLevel(17)).toBe('busy');
    expect(workloadLevel(18)).toBe('overloaded');
    expect(workloadLevel(100)).toBe('overloaded');
  });

  it('classifies daily counts against the daily thresholds', () => {
    expect(workloadLevel(2, DAILY_WORKLOAD_THRESHOLDS)).toBe('normal');
    expect(workloadLevel(3, DAILY_WORKLOAD_THRESHOLDS)).toBe('busy');
    expect(workloadLevel(4, DAILY_WORKLOAD_THRESHOLDS)).toBe('overloaded');
    expect(workloadLevel(9, DAILY_WORKLOAD_THRESHOLDS)).toBe('overloaded');
  });

  it('defaults to the weekly thresholds', () => {
    expect(workloadLevel(15)).toBe(workloadLevel(15, WEEKLY_WORKLOAD_THRESHOLDS));
  });

  it('exposes the daily thresholds as a five-working-day split of the weekly ones', () => {
    // Ceiling, not floor: floor(18/5) is 3, which would collide with the busy
    // threshold and leave "overloaded" unreachable at day granularity.
    expect(INSPECTOR_DAILY_BUSY_THRESHOLD).toBe(Math.ceil(INSPECTOR_WEEKLY_BUSY_THRESHOLD / 5));
    expect(INSPECTOR_DAILY_OVERLOAD_THRESHOLD).toBe(
      Math.ceil(INSPECTOR_WEEKLY_OVERLOAD_THRESHOLD / 5),
    );
    expect(INSPECTOR_DAILY_OVERLOAD_THRESHOLD).toBeGreaterThan(INSPECTOR_DAILY_BUSY_THRESHOLD);
  });
});

describe('workloadAlertLevel', () => {
  /**
   * Parity guard for the dashboard's existing `alertLevel` wire contract. These
   * expectations mirror the behaviour of the hardcoded `computeAlertLevel` this
   * helper replaces — if they change, the dashboard changes with them.
   */
  it('maps the weekly level onto the legacy alert colours', () => {
    expect(workloadAlertLevel(0)).toBeNull();
    expect(workloadAlertLevel(14)).toBeNull();
    expect(workloadAlertLevel(15)).toBe('yellow');
    expect(workloadAlertLevel(17)).toBe('yellow');
    expect(workloadAlertLevel(18)).toBe('red');
    expect(workloadAlertLevel(40)).toBe('red');
  });

  it('classifies a daily count against the daily thresholds when asked to', () => {
    expect(workloadAlertLevel(0, DAILY_WORKLOAD_THRESHOLDS)).toBeNull();
    expect(workloadAlertLevel(2, DAILY_WORKLOAD_THRESHOLDS)).toBeNull();
    expect(workloadAlertLevel(3, DAILY_WORKLOAD_THRESHOLDS)).toBe('yellow');
    expect(workloadAlertLevel(4, DAILY_WORKLOAD_THRESHOLDS)).toBe('red');
    expect(workloadAlertLevel(9, DAILY_WORKLOAD_THRESHOLDS)).toBe('red');
  });

  /**
   * The regression guard for the dashboard bug this parameter exists to fix: a
   * one-day count of 4 is an overloaded day, but measured against the weekly
   * thresholds it reads as no alert at all. Before the parameter existed the
   * dashboard's "Tomorrow" card could only ever take the second reading, so it
   * never fired.
   */
  it('gives the same count opposite verdicts under each threshold set', () => {
    expect(workloadAlertLevel(4)).toBeNull();
    expect(workloadAlertLevel(4, DAILY_WORKLOAD_THRESHOLDS)).toBe('red');
  });

  it('defaults to the weekly thresholds when none are passed', () => {
    expect(workloadAlertLevel(15)).toBe(workloadAlertLevel(15, WEEKLY_WORKLOAD_THRESHOLDS));
  });
});
