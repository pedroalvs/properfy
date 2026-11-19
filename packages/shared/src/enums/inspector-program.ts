/**
 * Inspector program — goals & rewards vocabulary (F08).
 *
 * Operations defines goals; at the end of each period the platform measures every
 * active inspector against each goal with the F07 reliability engine, and every
 * achiever earns a cash `RewardAward` (DV1). Levels are derived from the current
 * reliability index and streaks from closed-period participation — neither is
 * stored (D3/D4). The `inspector_goals`/`reward_awards`/`goal_period_closures`
 * tables are platform-scoped (no `tenant_id`, D12). Period type reuses the
 * existing `BillingPeriodType`.
 */
import type { ReliabilityMetricKey } from './reliability';

/** The ten goal metrics (canonical order). */
export const GoalMetric = {
  /** Count of completed services in the period. */
  VOLUME: 'VOLUME',
  /** Count of completed services whose property is inside a region. */
  REGION_VOLUME: 'REGION_VOLUME',
  /** Count of completed services of a service type. */
  SERVICE_TYPE_VOLUME: 'SERVICE_TYPE_VOLUME',
  /** Reliability index score recomputed over the goal period (points). */
  INDEX_AT_LEAST: 'INDEX_AT_LEAST',
  /** Punctuality rate (reliability metric). */
  PUNCTUALITY: 'PUNCTUALITY',
  /** Geofence rate (reliability metric). */
  GEOFENCE: 'GEOFENCE',
  /** Completion ("no stuck") rate (reliability metric). */
  NO_STUCK: 'NO_STUCK',
  /** Satisfaction rate (reliability metric). */
  SATISFACTION: 'SATISFACTION',
  /** Late-notice rate (reliability metric; DV6 treats zero late services as perfect). */
  LATE_NOTICE: 'LATE_NOTICE',
  /** Dropped-job ("can't do") rate — compared with "at most" (P1). */
  CANT_DO_MAX: 'CANT_DO_MAX',
} as const;
export type GoalMetric = (typeof GoalMetric)[keyof typeof GoalMetric];

/** Canonical order of the ten metrics (UI render order, label coverage). */
export const GOAL_METRICS: GoalMetric[] = [
  GoalMetric.VOLUME,
  GoalMetric.REGION_VOLUME,
  GoalMetric.SERVICE_TYPE_VOLUME,
  GoalMetric.INDEX_AT_LEAST,
  GoalMetric.PUNCTUALITY,
  GoalMetric.GEOFENCE,
  GoalMetric.NO_STUCK,
  GoalMetric.SATISFACTION,
  GoalMetric.LATE_NOTICE,
  GoalMetric.CANT_DO_MAX,
];

export const GoalComparator = {
  GTE: 'GTE',
  LTE: 'LTE',
} as const;
export type GoalComparator = (typeof GoalComparator)[keyof typeof GoalComparator];

/**
 * The comparator is fixed per metric (P1): the server rejects any other
 * combination. Only `CANT_DO_MAX` uses "at most" (`LTE`); the other nine use `GTE`.
 */
export const GOAL_METRIC_COMPARATOR: Record<GoalMetric, GoalComparator> = {
  VOLUME: GoalComparator.GTE,
  REGION_VOLUME: GoalComparator.GTE,
  SERVICE_TYPE_VOLUME: GoalComparator.GTE,
  INDEX_AT_LEAST: GoalComparator.GTE,
  PUNCTUALITY: GoalComparator.GTE,
  GEOFENCE: GoalComparator.GTE,
  NO_STUCK: GoalComparator.GTE,
  SATISFACTION: GoalComparator.GTE,
  LATE_NOTICE: GoalComparator.GTE,
  CANT_DO_MAX: GoalComparator.LTE,
};

/** How a metric is evaluated: a raw count, the index score, or a reliability rate. */
export type GoalMetricKind = 'VOLUME' | 'INDEX' | 'RATE';
export const GOAL_METRIC_KIND: Record<GoalMetric, GoalMetricKind> = {
  VOLUME: 'VOLUME',
  REGION_VOLUME: 'VOLUME',
  SERVICE_TYPE_VOLUME: 'VOLUME',
  INDEX_AT_LEAST: 'INDEX',
  PUNCTUALITY: 'RATE',
  GEOFENCE: 'RATE',
  NO_STUCK: 'RATE',
  SATISFACTION: 'RATE',
  LATE_NOTICE: 'RATE',
  CANT_DO_MAX: 'RATE',
};

/**
 * The F07 reliability metric a rate goal reads (null for volume/index goals).
 * `CANT_DO_MAX` reads `CANT_ATTEND` (then compared "at most", P1/P8).
 */
export const GOAL_METRIC_RELIABILITY_KEY: Record<GoalMetric, ReliabilityMetricKey | null> = {
  VOLUME: null,
  REGION_VOLUME: null,
  SERVICE_TYPE_VOLUME: null,
  INDEX_AT_LEAST: null,
  PUNCTUALITY: 'PUNCTUALITY',
  GEOFENCE: 'GEOFENCE',
  NO_STUCK: 'NO_STUCK',
  SATISFACTION: 'SATISFACTION',
  LATE_NOTICE: 'LATE_NOTICE',
  CANT_DO_MAX: 'CANT_ATTEND',
};

/** Short English label per metric. */
export const GOAL_METRIC_LABELS: Record<GoalMetric, string> = {
  VOLUME: 'Inspections completed',
  REGION_VOLUME: 'Inspections in a region',
  SERVICE_TYPE_VOLUME: 'Inspections of a service type',
  INDEX_AT_LEAST: 'Reliability index',
  PUNCTUALITY: 'Punctuality rate',
  GEOFENCE: 'Geofence rate',
  NO_STUCK: 'Completion rate',
  SATISFACTION: 'Satisfaction rate',
  LATE_NOTICE: 'Late-notice rate',
  CANT_DO_MAX: 'Dropped-job rate',
};

/** Reward lifecycle. `PAID` and void-after-invoicing arrive in TASK-F08-6 (Q12). */
export const RewardAwardStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  PAID: 'PAID',
  VOID: 'VOID',
} as const;
export type RewardAwardStatus = (typeof RewardAwardStatus)[keyof typeof RewardAwardStatus];

export const REWARD_AWARD_STATUS_LABELS: Record<RewardAwardStatus, string> = {
  PENDING: 'Pending review',
  APPROVED: 'Approved',
  PAID: 'Paid',
  VOID: 'Voided',
};

/** Derived inspector level (D3); never stored. */
export const InspectorLevel = {
  BRONZE: 'BRONZE',
  SILVER: 'SILVER',
  GOLD: 'GOLD',
} as const;
export type InspectorLevel = (typeof InspectorLevel)[keyof typeof InspectorLevel];

export const INSPECTOR_LEVEL_LABELS: Record<InspectorLevel, string> = {
  BRONZE: 'Bronze',
  SILVER: 'Silver',
  GOLD: 'Gold',
};

/** A rate goal needs at least this many services in the period to be evaluable (D5). */
export const GOAL_RATE_MINIMUM_VOLUME = 10;

/** Max overdue periods one goal closes per run (oldest first); the rest log a warning. */
export const CLOSE_CATCH_UP_MAX_PERIODS = 8;

/** A goal whose next period starts within this many days shows as "Starting soon" (L-F08-12). */
export const UPCOMING_GOAL_LOOKAHEAD_DAYS = 7;
