/**
 * Field-events enums (F03). This file is created by TASK-F03-1 with the geofence
 * mode; TASK-F03-2 appends the inspector field-event enums (CANT_DO, LATE_NOTICE,
 * reason codes and labels) here.
 */

/** How the geofence behaves at inspector check-in. */
export const GeofenceMode = {
  /** Record the breach for the operation; never stop the inspector. */
  FLAG: 'FLAG',
  /** Refuse a confirmed out-of-radius check-in. Falls back to FLAG when the
   *  measurement is unreliable (no property coordinates, no accuracy, or
   *  accuracy coarser than the radius). */
  BLOCK: 'BLOCK',
} as const;

export type GeofenceMode = (typeof GeofenceMode)[keyof typeof GeofenceMode];

/** What an inspector reported from the field (TASK-F03-2). */
export const InspectorFieldEventType = {
  /** "Can't do this job" — drives SCHEDULED → REJECTED (INSPECTOR_UNABLE). */
  CANT_DO: 'CANT_DO',
  /** "Running late" — records an estimated delay; no status change. */
  LATE_NOTICE: 'LATE_NOTICE',
} as const;
export type InspectorFieldEventType =
  (typeof InspectorFieldEventType)[keyof typeof InspectorFieldEventType];

/** Reason an inspector could not complete a job ("Can't do this job"). */
export const FieldIssueReason = {
  NO_ANSWER: 'NO_ANSWER',
  KEY_FAILED: 'KEY_FAILED',
  TENANT_REFUSED: 'TENANT_REFUSED',
  UNSAFE: 'UNSAFE',
  SITE_ISSUE: 'SITE_ISSUE',
  CANT_ATTEND: 'CANT_ATTEND',
} as const;
export type FieldIssueReason = (typeof FieldIssueReason)[keyof typeof FieldIssueReason];

/** Display labels for the "Can't do this job" reasons (English; app + web). */
export const FIELD_ISSUE_REASON_LABELS: Record<FieldIssueReason, string> = {
  NO_ANSWER: 'No answer at the door',
  KEY_FAILED: "Key didn't work",
  TENANT_REFUSED: 'Tenant refused entry',
  UNSAFE: 'Unsafe to enter',
  SITE_ISSUE: 'Problem at the property',
  CANT_ATTEND: "I can't attend",
};

/** Reasons that require a free-text note before the report is accepted. */
export const FIELD_ISSUE_NOTE_REQUIRED_REASONS: FieldIssueReason[] = ['SITE_ISSUE'];

/** Reason an inspector is running late. */
export const LateNoticeReason = {
  TRAFFIC: 'TRAFFIC',
  PREVIOUS_JOB_OVERRAN: 'PREVIOUS_JOB_OVERRAN',
  PERSONAL: 'PERSONAL',
  OTHER: 'OTHER',
} as const;
export type LateNoticeReason = (typeof LateNoticeReason)[keyof typeof LateNoticeReason];

/** Display labels for the "Running late" reasons. */
export const LATE_NOTICE_REASON_LABELS: Record<LateNoticeReason, string> = {
  TRAFFIC: 'Traffic',
  PREVIOUS_JOB_OVERRAN: 'Previous job ran over',
  PERSONAL: 'Personal reason',
  OTHER: 'Other',
};

/** Suggested delay options (minutes) for the "Running late" sheet. */
export const LATE_NOTICE_MINUTES_OPTIONS = [10, 20, 30, 45, 60, 90] as const;
