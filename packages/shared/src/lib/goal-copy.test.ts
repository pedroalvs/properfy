import { describe, it, expect } from 'vitest';
import { describeGoal } from './goal-copy';
import { GoalMetric } from '../enums/inspector-program';

describe('describeGoal', () => {
  it('VOLUME ignores scopeLabel', () => {
    expect(describeGoal({ metric: GoalMetric.VOLUME, target: 10, scopeLabel: 'ignored' })).toBe(
      'Complete 10 inspections',
    );
    expect(describeGoal({ metric: GoalMetric.VOLUME, target: 10, scopeLabel: null })).toBe(
      'Complete 10 inspections',
    );
  });

  it('REGION_VOLUME uses the region name, with a deleted fallback', () => {
    expect(
      describeGoal({ metric: GoalMetric.REGION_VOLUME, target: 9, scopeLabel: 'Sydney North' }),
    ).toBe('9 inspections in Sydney North');
    expect(describeGoal({ metric: GoalMetric.REGION_VOLUME, target: 9, scopeLabel: null })).toBe(
      '9 inspections in a deleted region',
    );
  });

  it('SERVICE_TYPE_VOLUME uses the service-type name, with a deleted fallback', () => {
    expect(
      describeGoal({ metric: GoalMetric.SERVICE_TYPE_VOLUME, target: 9, scopeLabel: 'Routine' }),
    ).toBe('9 Routine inspections');
    expect(
      describeGoal({ metric: GoalMetric.SERVICE_TYPE_VOLUME, target: 9, scopeLabel: null }),
    ).toBe('9 inspections of a deleted service type');
  });

  it('INDEX_AT_LEAST', () => {
    expect(
      describeGoal({ metric: GoalMetric.INDEX_AT_LEAST, target: 85, scopeLabel: null }),
    ).toBe('Reliability index of at least 85');
  });

  it('rate metrics ignore scopeLabel and read "% of the time" phrasing', () => {
    expect(describeGoal({ metric: GoalMetric.PUNCTUALITY, target: 90, scopeLabel: 'x' })).toBe(
      'Arrive within the window at least 90% of the time',
    );
    expect(describeGoal({ metric: GoalMetric.GEOFENCE, target: 95, scopeLabel: null })).toBe(
      'Check in and out on site at least 95% of the time',
    );
    expect(describeGoal({ metric: GoalMetric.NO_STUCK, target: 98, scopeLabel: null })).toBe(
      'Finish without getting stuck at least 98% of the time',
    );
    expect(describeGoal({ metric: GoalMetric.SATISFACTION, target: 80, scopeLabel: null })).toBe(
      'Tenant satisfaction of at least 80%',
    );
    expect(describeGoal({ metric: GoalMetric.LATE_NOTICE, target: 75, scopeLabel: null })).toBe(
      'Warn ahead when running late at least 75% of the time',
    );
    expect(describeGoal({ metric: GoalMetric.CANT_DO_MAX, target: 5, scopeLabel: null })).toBe(
      'Drop no more than 5% of jobs',
    );
  });
});
