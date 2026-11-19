import { describe, it, expect } from 'vitest';
import { GoalMetric, BillingPeriodType } from '@properfy/shared';
import {
  goalMetricLabel,
  metricTargetUnit,
  metricComparatorWord,
  PERIOD_CYCLE_LABELS,
  formatCivilDay,
  formatCivilDayWithWeekday,
  formatCivilRangeWithWeekday,
  formatProgramInstant,
  formatPeriodOptionLabel,
} from './goal-labels';

describe('goal-labels', () => {
  it('metric UI labels differ from the terse shared labels', () => {
    expect(goalMetricLabel(GoalMetric.VOLUME)).toBe('Volume');
    expect(goalMetricLabel(GoalMetric.REGION_VOLUME)).toBe('Region volume');
    expect(goalMetricLabel(GoalMetric.SERVICE_TYPE_VOLUME)).toBe('Service type volume');
    expect(goalMetricLabel(GoalMetric.INDEX_AT_LEAST)).toBe('Reliability index');
    expect(goalMetricLabel(GoalMetric.PUNCTUALITY)).toBe('On-time arrival');
    expect(goalMetricLabel(GoalMetric.GEOFENCE)).toBe('On-site check-in');
    expect(goalMetricLabel(GoalMetric.NO_STUCK)).toBe('Finished without getting stuck');
    expect(goalMetricLabel(GoalMetric.SATISFACTION)).toBe('Tenant satisfaction');
    expect(goalMetricLabel(GoalMetric.LATE_NOTICE)).toBe('Late notice in advance');
    expect(goalMetricLabel(GoalMetric.CANT_DO_MAX)).toBe("Can't-do rate");
  });

  it('target unit and comparator word per metric kind', () => {
    expect(metricTargetUnit(GoalMetric.VOLUME)).toBe('');
    expect(metricTargetUnit(GoalMetric.INDEX_AT_LEAST)).toBe('points');
    expect(metricTargetUnit(GoalMetric.PUNCTUALITY)).toBe('%');
    expect(metricComparatorWord(GoalMetric.PUNCTUALITY)).toBe('at least');
    expect(metricComparatorWord(GoalMetric.CANT_DO_MAX)).toBe('at most');
  });

  it('period cycle labels', () => {
    expect(PERIOD_CYCLE_LABELS.WEEKLY).toBe('Weekly');
    expect(PERIOD_CYCLE_LABELS.FORTNIGHTLY).toBe('Fortnightly');
    expect(PERIOD_CYCLE_LABELS.MONTHLY).toBe('Monthly');
  });

  it('formats civil dates deterministically (with/without weekday)', () => {
    // 2026-11-02 is a Monday.
    expect(formatCivilDay('2026-11-02')).toBe('2 Nov 2026');
    expect(formatCivilDayWithWeekday('2026-11-02')).toBe('Mon 2 Nov 2026');
    // 2026-12-21 is a Monday.
    expect(formatCivilDayWithWeekday('2026-12-21')).toBe('Mon 21 Dec 2026');
    expect(formatCivilDay(null)).toBe('');
  });

  it('formats a civil range sharing the year', () => {
    // 2026-11-02 Mon .. 2026-11-29 Sun.
    expect(formatCivilRangeWithWeekday('2026-11-02', '2026-11-29')).toBe(
      'Mon 2 Nov – Sun 29 Nov 2026',
    );
  });

  it('formats an instant in Sydney as "d MMM yyyy, h:mm a"', () => {
    // 2026-11-01T00:00Z = Sydney (UTC+11, DST) 1 Nov 2026, 11:00 am.
    expect(formatProgramInstant('2026-11-01T00:00:00.000Z')).toBe('1 Nov 2026, 11:00 am');
    expect(formatProgramInstant(null)).toBe('');
  });

  it('period option labels per cycle', () => {
    expect(formatPeriodOptionLabel(BillingPeriodType.WEEKLY, '2026-11-02', '2026-11-08')).toBe(
      'Week of Mon 2 Nov 2026',
    );
    expect(formatPeriodOptionLabel(BillingPeriodType.FORTNIGHTLY, '2026-11-02', '2026-11-15')).toBe(
      'Fortnight of Mon 2 Nov 2026',
    );
    expect(formatPeriodOptionLabel(BillingPeriodType.MONTHLY, '2026-11-01', '2026-11-30')).toBe(
      'November 2026',
    );
  });
});
