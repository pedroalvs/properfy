/**
 * Inspector reliability index — metric vocabulary and tuning constants (F07).
 *
 * The eight metrics are combined by `reliabilityIndex` (weights + thresholds, in
 * `schemas/platform-settings.ts`) into a single 0–100 score. The backend
 * `reliability` module computes each metric; the web "Inspector performance"
 * screen (TASK-F07-3) renders the labels/descriptions below.
 */

export const ReliabilityMetricKey = {
  /** Checked in within the booked window (or the plan's published arrival). */
  PUNCTUALITY: 'PUNCTUALITY',
  /** Checked in and out within range of the property (geofence). */
  GEOFENCE: 'GEOFENCE',
  /** Finished without getting stuck (under the 6-hour alert threshold). */
  NO_STUCK: 'NO_STUCK',
  /** Average rating from completed-inspection satisfaction surveys. */
  SATISFACTION: 'SATISFACTION',
  /** Warned ahead of time when running late. */
  LATE_NOTICE: 'LATE_NOTICE',
  /** Attended the jobs taken on, without dropping them ("can't do"). */
  CANT_ATTEND: 'CANT_ATTEND',
  /** Services completed, relative to the active inspectors' median volume. */
  VOLUME: 'VOLUME',
  /** Completed inspections that were not later rejected as not carried out. */
  DONE_REJECTED: 'DONE_REJECTED',
} as const;
export type ReliabilityMetricKey = (typeof ReliabilityMetricKey)[keyof typeof ReliabilityMetricKey];

/**
 * Canonical order of the eight metrics. Every result array, the weights object
 * and the UI render in this order.
 */
export const RELIABILITY_METRIC_KEYS: ReliabilityMetricKey[] = [
  ReliabilityMetricKey.PUNCTUALITY,
  ReliabilityMetricKey.GEOFENCE,
  ReliabilityMetricKey.NO_STUCK,
  ReliabilityMetricKey.SATISFACTION,
  ReliabilityMetricKey.LATE_NOTICE,
  ReliabilityMetricKey.CANT_ATTEND,
  ReliabilityMetricKey.VOLUME,
  ReliabilityMetricKey.DONE_REJECTED,
];

/** Short English label per metric (TASK-F07-3 finalises the exact UI copy). */
export const RELIABILITY_METRIC_LABELS: Record<ReliabilityMetricKey, string> = {
  PUNCTUALITY: 'Punctuality',
  GEOFENCE: 'Geofence',
  NO_STUCK: 'Completion',
  SATISFACTION: 'Satisfaction',
  LATE_NOTICE: 'Late notice',
  CANT_ATTEND: 'Attendance',
  VOLUME: 'Volume',
  DONE_REJECTED: 'Valid completion',
};

/** One-line English description per metric for the drawer/tooltip. */
export const RELIABILITY_METRIC_DESCRIPTIONS: Record<ReliabilityMetricKey, string> = {
  PUNCTUALITY: 'Checked in within the booked window, or by the plan’s published arrival time.',
  GEOFENCE: 'Checked in and out within range of the property.',
  NO_STUCK: 'Finished the inspection without getting stuck (under 6 hours).',
  SATISFACTION: 'Average rating from completed-inspection satisfaction surveys.',
  LATE_NOTICE: 'Warned ahead of time whenever running late.',
  CANT_ATTEND: 'Attended the jobs taken on, without dropping them or not showing up.',
  VOLUME: 'Services completed, relative to the active inspectors’ median volume.',
  DONE_REJECTED: 'Completed inspections that were not later rejected as not carried out.',
};

/**
 * Score status for a computed window. `NOT_COMPUTED` (no snapshot yet) is added
 * by the API layer in TASK-F07-2; this slice only emits the three below.
 */
export const ReliabilityScoreStatus = {
  /** Enough volume and at least one weighted metric — `score` is a number. */
  SCORED: 'SCORED',
  /** Below `minimumVolume` — `score` is null, metrics still computed. */
  INSUFFICIENT_VOLUME: 'INSUFFICIENT_VOLUME',
  /** Every weighted metric is null (or all weights 0) — `score` is null. */
  NO_WEIGHTED_DATA: 'NO_WEIGHTED_DATA',
} as const;
export type ReliabilityScoreStatus = (typeof ReliabilityScoreStatus)[keyof typeof ReliabilityScoreStatus];

/** Rolling window (days) the daily snapshot covers; F08 reuses the engine with its own period. */
export const RELIABILITY_WINDOW_DAYS = 30;

/** Travel weight factor in the service weight `duration + factor × plannedTravel` (P7, not configurable). */
export const RELIABILITY_TRAVEL_FACTOR = 1;

/** A `CANT_ATTEND` warned at least this many hours before the window start leaves metric 1 (L-F07-01). */
export const CANT_ATTEND_EARLY_NOTICE_HOURS = 24;

/** Maximum failures retained per metric result (L-F07-06); `failureCount` keeps the true total. */
export const RELIABILITY_FAILURES_MAX = 20;
