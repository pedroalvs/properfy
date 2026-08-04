/**
 * Capacity thresholds for inspector workload.
 *
 * The weekly numbers are not new: the dashboard has flagged inspectors at 15 and
 * 18 since it shipped, hardcoded inside its repository. They live here so the
 * dashboard's alert list and the Inspector Workload screen classify the same
 * count the same way, and so a future move to per-inspector capacity has one
 * place to change.
 *
 * The daily numbers are derived, not given by the client: the weekly thresholds
 * spread over a five-day working week, rounded up. Up rather than down matters —
 * `floor(18 / 5)` is 3, the same as the busy threshold, which would make
 * "overloaded" unreachable at day granularity. They are named rather than
 * inlined so the heatmap legend and the cell classifier cannot drift apart.
 */

export const INSPECTOR_WEEKLY_BUSY_THRESHOLD = 15;
export const INSPECTOR_WEEKLY_OVERLOAD_THRESHOLD = 18;
export const INSPECTOR_DAILY_BUSY_THRESHOLD = 3;
export const INSPECTOR_DAILY_OVERLOAD_THRESHOLD = 4;

export interface WorkloadThresholds {
  busy: number;
  overloaded: number;
}

export const WEEKLY_WORKLOAD_THRESHOLDS: WorkloadThresholds = {
  busy: INSPECTOR_WEEKLY_BUSY_THRESHOLD,
  overloaded: INSPECTOR_WEEKLY_OVERLOAD_THRESHOLD,
};

export const DAILY_WORKLOAD_THRESHOLDS: WorkloadThresholds = {
  busy: INSPECTOR_DAILY_BUSY_THRESHOLD,
  overloaded: INSPECTOR_DAILY_OVERLOAD_THRESHOLD,
};

export const WORKLOAD_LEVELS = ['normal', 'busy', 'overloaded'] as const;
export type WorkloadLevel = (typeof WORKLOAD_LEVELS)[number];

/**
 * Classification is inclusive at each boundary — a count of exactly 15 is
 * already busy and exactly 18 is already overloaded.
 */
export function workloadLevel(
  count: number,
  thresholds: WorkloadThresholds = WEEKLY_WORKLOAD_THRESHOLDS,
): WorkloadLevel {
  if (count >= thresholds.overloaded) return 'overloaded';
  if (count >= thresholds.busy) return 'busy';
  return 'normal';
}

/**
 * Adapter onto the dashboard's existing `alertLevel` wire contract
 * (`'yellow' | 'red' | null`). Kept separate from `workloadLevel` so the new
 * screen can use the descriptive vocabulary without changing a shipped payload.
 */
export function workloadAlertLevel(count: number): 'yellow' | 'red' | null {
  const level = workloadLevel(count);
  if (level === 'overloaded') return 'red';
  if (level === 'busy') return 'yellow';
  return null;
}
