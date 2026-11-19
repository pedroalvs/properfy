import { GoalMetric } from '../enums/inspector-program';

/**
 * Inputs for a goal's plain-language description. `scopeLabel` is the region name
 * (`REGION_VOLUME`) or service-type name (`SERVICE_TYPE_VOLUME`); `null` means the
 * scope target was deleted (L-F08-13). Other metrics ignore `scopeLabel`.
 */
export interface DescribeGoalInput {
  metric: GoalMetric;
  target: number;
  scopeLabel: string | null;
}

/**
 * Human sentence for a goal (F08). Shared by the web Goals/Rewards screens
 * (TASK-F08-3), the PWA Challenges tile (TASK-F08-4) and the program report
 * (TASK-F08-5), so it lives in `@properfy/shared`, not duplicated per workspace.
 *
 * `target` is rendered as-is (callers pass the already-correct numeric target —
 * an integer for volume metrics, a percentage for rate metrics, index points for
 * `INDEX_AT_LEAST`).
 */
export function describeGoal({ metric, target, scopeLabel }: DescribeGoalInput): string {
  switch (metric) {
    case GoalMetric.VOLUME:
      return `Complete ${target} inspections`;
    case GoalMetric.REGION_VOLUME:
      return scopeLabel === null
        ? `${target} inspections in a deleted region`
        : `${target} inspections in ${scopeLabel}`;
    case GoalMetric.SERVICE_TYPE_VOLUME:
      return scopeLabel === null
        ? `${target} inspections of a deleted service type`
        : `${target} ${scopeLabel} inspections`;
    case GoalMetric.INDEX_AT_LEAST:
      return `Reliability index of at least ${target}`;
    case GoalMetric.PUNCTUALITY:
      return `Arrive within the window at least ${target}% of the time`;
    case GoalMetric.GEOFENCE:
      return `Check in and out on site at least ${target}% of the time`;
    case GoalMetric.NO_STUCK:
      return `Finish without getting stuck at least ${target}% of the time`;
    case GoalMetric.SATISFACTION:
      return `Tenant satisfaction of at least ${target}%`;
    case GoalMetric.LATE_NOTICE:
      return `Warn ahead when running late at least ${target}% of the time`;
    case GoalMetric.CANT_DO_MAX:
      return `Drop no more than ${target}% of jobs`;
  }
}
