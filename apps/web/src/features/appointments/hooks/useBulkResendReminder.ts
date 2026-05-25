import { useCreateMutation } from '@/hooks/useApiQuery';
import type {
  BulkResendReminderRequest,
  BulkResendReminderResponse,
} from '@properfy/shared';

/**
 * 023 §FR-241..245 — bulk re-send tenant-portal reminders.
 *
 * The mutation invalidates the appointment list so any updated metadata
 * (e.g. last-reminder timestamp, if the listing surfaces it) refreshes.
 */
export function useBulkResendReminder() {
  return useCreateMutation<BulkResendReminderRequest, BulkResendReminderResponse>(
    '/v1/appointments/bulk-resend-reminder',
    [['appointments']],
  );
}
