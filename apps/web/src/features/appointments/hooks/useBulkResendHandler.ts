import { useCallback } from 'react';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useBulkResendReminder } from './useBulkResendReminder';

export interface UseBulkResendHandlerReturn {
  resend: () => Promise<void>;
  isPending: boolean;
}

/**
 * Bulk re-send with its result reporting. Shared by the list and the board so
 * the per-outcome breakdown and the failure toast cannot drift between them.
 *
 * `onDone` runs only on success — the caller uses it to clear its selection.
 */
export function useBulkResendHandler(
  appointmentIds: string[],
  onDone: () => void,
): UseBulkResendHandlerReturn {
  const { showSuccess, showError } = useSnackbar();
  const bulkResend = useBulkResendReminder();

  const resend = useCallback(async () => {
    if (appointmentIds.length === 0) return;
    try {
      // The backend buckets the per-day idempotency key in the platform
      // timezone (Sydney); no client timezone is sent.
      const response = await bulkResend.mutateAsync({ appointmentIds });
      const results = response.data.results;
      const count = (status: string) => results.filter((r) => r.status === status).length;
      showSuccess(
        `${count('SENT')} sent · ${count('NO_PRIMARY_CONTACT')} no primary · ` +
          `${count('IDEMPOTENT_REPLAY')} already sent today · ${count('ERROR')} errors`,
      );
      onDone();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to re-send reminders');
    }
  }, [appointmentIds, bulkResend, showSuccess, showError, onDone]);

  return { resend, isPending: bulkResend.isPending };
}
