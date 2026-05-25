import { useCreateMutation } from '@/hooks/useApiQuery';
import type { BulkRescheduleRequest, BulkActionResponse } from '@properfy/shared';

/**
 * 025 §FR-421 — bulk reschedule from the appointment map flow.
 */
export function useBulkRescheduleAppointments() {
  return useCreateMutation<BulkRescheduleRequest, BulkActionResponse>(
    '/v1/appointments/bulk-reschedule',
    [['appointments-map'], ['appointments']],
  );
}
