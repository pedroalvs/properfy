/**
 * Day-plan constants (F04-2). Publication time, ETA-accuracy metric thresholds,
 * and the reorder stop ceiling. The optimizer defaults/limits live in
 * `route-planning/types.ts` (F04-1); route weights reuse `DEFAULT_ROUTE_WEIGHTS`.
 */

/** Local wall-clock time the next day's plan auto-publishes (inspector timezone). */
export const DAY_PLAN_PUBLISH_LOCAL_TIME = '19:30';
export const DAY_PLAN_PUBLISH_HOUR = 19;
export const DAY_PLAN_PUBLISH_MINUTE = 30;

/** "Route ETA accuracy" metric (measured against the frozen published start). */
export const ROUTE_ETA_ACCURACY_THRESHOLD_MINUTES = 10;
export const ROUTE_ETA_ACCURACY_MIN_SAMPLE = 30;
export const ROUTE_ETA_ACCURACY_OUTLIER_MINUTES = 180;
/** Allowed `days` look-back range for the metric query. */
export const ROUTE_ETA_ACCURACY_MIN_DAYS = 7;
export const ROUTE_ETA_ACCURACY_MAX_DAYS = 90;
export const ROUTE_ETA_ACCURACY_DEFAULT_DAYS = 30;

/** `PUT /order` accepts at most this many reorderable stop ids. */
export const DAY_PLAN_MAX_STOPS_PER_ORDER = 25;

/** Weights preview accepts a date within today..today+14 (effective actor timezone). */
export const DAY_PLAN_PREVIEW_MAX_DAYS_AHEAD = 14;

/** A transient-approximate plan is retried by the next GET only after this age. */
export const DAY_PLAN_APPROXIMATE_RETRY_MINUTES = 5;

/** INSP route-sheet downloads are limited to dates within the last N days. */
export const DAY_PLAN_SHEET_MAX_AGE_DAYS = 30;
