import { useCallback } from 'react';
import { useSnackbar } from '@/hooks/useSnackbar';
import { getErrorMessage } from '@/lib/api-error';
import { useBulkResendReminder } from './useBulkResendReminder';

export interface UseBulkResendHandlerReturn {
  resend: () => Promise<void>;
  isPending: boolean;
}

/**
 * Bulk re-send with its result reporting. Shared by the list and the board so
 * the per-outcome breakdown and the failure toast cannot drift between them.
 *
 * `onDone` runs only when every appointment was handled without error — the
 * caller uses it to clear its selection. A partial failure keeps the selection
 * so the user can retry without re-picking the rows.
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
      const errors = count('ERROR');
      const blocked = count('TENANT_NOTIFICATIONS_BLOCKED');
      showSuccess(
        `${count('SENT')} sent · ${count('NO_PRIMARY_CONTACT')} no primary · ` +
          `${count('IDEMPOTENT_REPLAY')} already sent today · ` +
          // Only shown when non-zero: most selections span a single unblocked agency.
          (blocked > 0 ? `${blocked} blocked (agency does not notify tenants) · ` : '') +
          `${errors} errors`,
      );
      if (errors === 0) onDone();
    } catch (e) {
      // getErrorMessage keeps 5xx internals off the screen and handles the
      // offline / 403 / 429 cases — never surface a raw exception message.
      showError(getErrorMessage(e, 'Failed to re-send reminders'));
    }
  }, [appointmentIds, bulkResend, showSuccess, showError, onDone]);

  return { resend, isPending: bulkResend.isPending };
}
