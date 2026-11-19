/**
 * Live Day (F05) enums, labels and client/server caps. Shared by the backend
 * read model (TASK-F05-1) and the web screen (TASK-F05-2).
 */

/** Derived operational state of an inspector for a day (D2). "In transit" is an inference. */
export const LiveDayInspectorState = {
  NOT_STARTED: 'NOT_STARTED',
  AT_PROPERTY: 'AT_PROPERTY',
  IN_TRANSIT: 'IN_TRANSIT',
  DONE_FOR_DAY: 'DONE_FOR_DAY',
} as const;
export type LiveDayInspectorState =
  (typeof LiveDayInspectorState)[keyof typeof LiveDayInspectorState];

/** Per-stop progress within a day. Exactly one stop is CURRENT (§3). */
export const LiveDayStopProgress = {
  DONE: 'DONE',
  CURRENT: 'CURRENT',
  OPEN: 'OPEN',
  REMAINING: 'REMAINING',
} as const;
export type LiveDayStopProgress =
  (typeof LiveDayStopProgress)[keyof typeof LiveDayStopProgress];

/** The seven alert types (D20). Plan infeasibility is an indicator, NOT an alert. */
export const LiveDayAlertType = {
  DELAY: 'DELAY',
  NOT_STARTED: 'NOT_STARTED',
  LATE_NOTICE: 'LATE_NOTICE',
  CANT_DO: 'CANT_DO',
  GEOFENCE: 'GEOFENCE',
  OUT_OF_WINDOW: 'OUT_OF_WINDOW',
  COMPLETION_REMINDER: 'COMPLETION_REMINDER',
} as const;
export type LiveDayAlertType = (typeof LiveDayAlertType)[keyof typeof LiveDayAlertType];

/** Source of the last known location pin (D1). */
export const LiveDayLastKnownSource = {
  CHECK_IN: 'CHECK_IN',
  CHECK_OUT: 'CHECK_OUT',
  BASE: 'BASE',
  NONE: 'NONE',
} as const;
export type LiveDayLastKnownSource =
  (typeof LiveDayLastKnownSource)[keyof typeof LiveDayLastKnownSource];

/** Threshold source for DELAY / NOT_STARTED alerts. */
export const LiveDayThresholdSource = {
  PLATFORM: 'PLATFORM',
  INSPECTOR: 'INSPECTOR',
} as const;
export type LiveDayThresholdSource =
  (typeof LiveDayThresholdSource)[keyof typeof LiveDayThresholdSource];

/** Geofence alert phase. */
export const LiveDayGeofencePhase = {
  START: 'START',
  FINISH: 'FINISH',
} as const;
export type LiveDayGeofencePhase =
  (typeof LiveDayGeofencePhase)[keyof typeof LiveDayGeofencePhase];

/** Severity order of the alert list (§5). Within a type, sort by occurredAt desc. */
export const LIVE_DAY_ALERT_TYPE_ORDER: readonly LiveDayAlertType[] = [
  LiveDayAlertType.CANT_DO,
  LiveDayAlertType.COMPLETION_REMINDER,
  LiveDayAlertType.NOT_STARTED,
  LiveDayAlertType.DELAY,
  LiveDayAlertType.LATE_NOTICE,
  LiveDayAlertType.GEOFENCE,
  LiveDayAlertType.OUT_OF_WINDOW,
] as const;

export const LIVE_DAY_STATE_LABELS: Record<LiveDayInspectorState, string> = {
  NOT_STARTED: 'Not started',
  AT_PROPERTY: 'At a property',
  IN_TRANSIT: 'In transit',
  DONE_FOR_DAY: 'Done for the day',
};

export const LIVE_DAY_ALERT_LABELS: Record<LiveDayAlertType, string> = {
  DELAY: 'Delay',
  NOT_STARTED: 'Not started',
  LATE_NOTICE: 'Running late',
  CANT_DO: "Can't do this job",
  GEOFENCE: 'Outside geofence',
  OUT_OF_WINDOW: 'Outside window',
  COMPLETION_REMINDER: 'Completion reminder sent',
};

/** Client-side cap on simultaneously drawn routes ("Show all routes"). */
export const LIVE_DAY_SHOW_ALL_MAX = 40;

/** Server-side guard: `includeGeometry=all` with a roster above this → 400 LIVE_DAY_TOO_MANY_ROUTES (L-F05-06). */
export const LIVE_DAY_GEOMETRY_ALL_MAX_INSPECTORS = 60;
