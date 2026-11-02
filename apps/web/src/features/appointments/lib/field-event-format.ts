import {
  FIELD_ISSUE_REASON_LABELS,
  LATE_NOTICE_REASON_LABELS,
  InspectorFieldEventType,
  formatReasonCodeLabel,
  type FieldIssueReason,
  type LateNoticeReason,
} from '@properfy/shared';

/**
 * Humanize a "Can't do this job" (CANT_DO) reason code. Falls back to the
 * generic humanizer for a code the web does not yet know (the backend sends the
 * reason as a plain string so a future value never trips serialization).
 */
export function formatFieldIssueReason(reason: string): string {
  return (
    FIELD_ISSUE_REASON_LABELS[reason as FieldIssueReason] ?? formatReasonCodeLabel(reason)
  );
}

/** Humanize a "Running late" (LATE_NOTICE) reason code, with the same fallback. */
export function formatLateNoticeReason(reason: string): string {
  return (
    LATE_NOTICE_REASON_LABELS[reason as LateNoticeReason] ?? formatReasonCodeLabel(reason)
  );
}

/**
 * Humanize a field-event reason by its event type. LATE_NOTICE reasons use the
 * late-notice label map; everything else (CANT_DO) uses the issue label map.
 */
export function formatFieldEventReason(type: string, reason: string): string {
  return type === InspectorFieldEventType.LATE_NOTICE
    ? formatLateNoticeReason(reason)
    : formatFieldIssueReason(reason);
}
