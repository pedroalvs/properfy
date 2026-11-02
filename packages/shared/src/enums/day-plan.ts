/**
 * Day-plan enums (F04-2). The plan is per inspector (a cross-tenant entity) and
 * aggregates stops from several agencies, so `DayPlan`/`DayPlanStop` carry no
 * `tenant_id` (D10 exception to root CLAUDE.md §7.1). Mirrors the Prisma enums.
 */

export const DayPlanStatus = {
  /** Computed but not published — only AM/OP recalculating before the 19:30 window; the inspector does not see it. */
  DRAFT: 'DRAFT',
  /** Published (`published_at` set) and fresh. */
  PUBLISHED: 'PUBLISHED',
  /** Inputs changed since the last compute; recomputed on open (INSP) or by the OP. */
  STALE: 'STALE',
} as const;
export type DayPlanStatus = (typeof DayPlanStatus)[keyof typeof DayPlanStatus];

export const DayPlanComputeTrigger = {
  SCHEDULED_PUBLISH: 'SCHEDULED_PUBLISH',
  ON_OPEN: 'ON_OPEN',
  MANUAL_RECALC: 'MANUAL_RECALC',
  REORDER: 'REORDER',
  ORIGIN_CHANGE: 'ORIGIN_CHANGE',
} as const;
export type DayPlanComputeTrigger =
  (typeof DayPlanComputeTrigger)[keyof typeof DayPlanComputeTrigger];

export const DayPlanOriginSource = {
  BASE: 'BASE',
  OVERRIDE: 'OVERRIDE',
  NONE: 'NONE',
  /** L-F04-07: today after the first check-in — the remaining leg departs from the last executed stop's property. */
  LAST_STOP: 'LAST_STOP',
} as const;
export type DayPlanOriginSource =
  (typeof DayPlanOriginSource)[keyof typeof DayPlanOriginSource];

export const DayPlanOriginWarning = {
  NO_BASE: 'NO_BASE',
  BASE_NOT_LOCATED: 'BASE_NOT_LOCATED',
} as const;
export type DayPlanOriginWarning =
  (typeof DayPlanOriginWarning)[keyof typeof DayPlanOriginWarning];

export const RoutingProvider = {
  MAPBOX: 'MAPBOX',
  STUB: 'STUB',
} as const;
export type RoutingProvider = (typeof RoutingProvider)[keyof typeof RoutingProvider];

/** `approximate_reason` on a plan/stop/leg that fell back to the stub or a transient failure. */
export const DayPlanApproximateReason = {
  NO_PROVIDER: 'NO_PROVIDER',
  RATE_LIMITED: 'RATE_LIMITED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  DEADLINE: 'DEADLINE',
  TOO_MANY_COORDINATES: 'TOO_MANY_COORDINATES',
  NO_ROUTE: 'NO_ROUTE',
} as const;
export type DayPlanApproximateReason =
  (typeof DayPlanApproximateReason)[keyof typeof DayPlanApproximateReason];

/** `stale_reason`: the FIRST reason since the last compute (zeroed on recompute). */
export const DayPlanStaleReason = {
  APPOINTMENT_STATUS_CHANGED: 'APPOINTMENT_STATUS_CHANGED',
  GROUP_CHANGED: 'GROUP_CHANGED',
  INSPECTOR_CANT_DO: 'INSPECTOR_CANT_DO',
  BASE_CHANGED: 'BASE_CHANGED',
} as const;
export type DayPlanStaleReason =
  (typeof DayPlanStaleReason)[keyof typeof DayPlanStaleReason];
