import { useCreateMutation } from '@/hooks/useApiQuery';
import type { BulkRescheduleRequest, BulkActionResponse } from '@properfy/shared';

/**
 * 025 §FR-421 — bulk reschedule from the appointment map flow.
 *
 * Status-preserving: delegates per item to `UpdateAppointmentUseCase`, so the
 * appointment keeps its status and inspector. `service-groups` is invalidated
 * too because `expandGroupTimeWindow` can widen the group's shared time window.
 */
export function useBulkRescheduleAppointments() {
  return useCreateMutation<BulkRescheduleRequest, BulkActionResponse>(
    '/v1/appointments/bulk-reschedule',
    [['appointments-map'], ['appointments'], ['service-groups'], ['service-groups-map']],
  );
}
