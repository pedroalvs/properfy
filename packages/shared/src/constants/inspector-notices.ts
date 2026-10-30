/**
 * Shared constants for inspector notices (F03 completion reminder, 03.16).
 *
 * The completion reminder (sent once a scheduled job's window has closed without
 * a check-out) is delivered through F02's `PublishSystemInspectorNoticeUseCase`,
 * whose idempotency is a `dedupeKey`. The key is scoped to the appointment, its
 * civil date (agency timezone) AND the inspector, so a same-day re-offer to a
 * different inspector still gets its own reminder (L-F03-03, D22). F05 discovers
 * these notices by matching on `COMPLETION_REMINDER_DEDUPE_PREFIX`.
 */
export const COMPLETION_REMINDER_DEDUPE_PREFIX = 'completion-reminder';

export interface CompletionReminderDedupeKeyParts {
  appointmentId: string;
  /** Civil date (`YYYY-MM-DD`) of the job in the agency timezone. */
  civilDate: string;
  inspectorId: string;
}

/** `completion-reminder:{appointmentId}:{civilDate}:{inspectorId}` (L-F03-03, D22). */
export function buildCompletionReminderDedupeKey({
  appointmentId,
  civilDate,
  inspectorId,
}: CompletionReminderDedupeKeyParts): string {
  return `${COMPLETION_REMINDER_DEDUPE_PREFIX}:${appointmentId}:${civilDate}:${inspectorId}`;
}
