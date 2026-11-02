import { type ApiError, getErrorMessage } from '@/lib/api-error';

/**
 * Message to show in a field-event sheet when a report fails. A 4xx is a
 * deliberate, safe-to-show server message (e.g. "You've already checked in to
 * this job."). A 5xx or a network error (status 0 / unknown) gets a generic
 * retry line instead of a leaked internal message (FR-017).
 */
export function fieldEventErrorMessage(err: unknown): string {
  const status = (err as ApiError | null)?.status;
  if (status == null || status === 0 || status >= 500) {
    return "Couldn't send. Check your connection and try again.";
  }
  return getErrorMessage(err);
}
