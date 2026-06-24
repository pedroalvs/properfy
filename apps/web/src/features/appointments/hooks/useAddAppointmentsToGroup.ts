import { useCreateMutation } from '@/hooks/useApiQuery';
import type { AddAppointmentsToGroupRequest } from '@properfy/shared';

/**
 * 026 §FR-510 — Add appointments to an existing service group.
 *
 * Invalidates the map listing + the service-groups list because a DRAFT
 * appointment auto-transitions to AWAITING_INSPECTOR when linked, which
 * changes its marker colour, and the target group's `groupSize` increments.
 */
export interface AddAppointmentsToGroupResponse {
  results: Array<{
    appointmentId: string;
    status:
      | 'OK' | 'INVALID_STATUS' | 'ALREADY_GROUPED' | 'INVALID_TENANT'
      | 'INVALID_SERVICE_TYPE' | 'INVALID_DATE'
      | 'GROUP_IN_TERMINAL_STATE' | 'GROUP_CAPACITY_EXCEEDED'
      | 'NOT_FOUND' | 'ERROR';
    error?: { code: string; message: string };
  }>;
}

export function useAddAppointmentsToGroup(groupId: string | null) {
  return useCreateMutation<AddAppointmentsToGroupRequest, AddAppointmentsToGroupResponse>(
    groupId ? `/v1/service-groups/${groupId}/appointments` : '/v1/service-groups/__none__/appointments',
    [['appointments-map'], ['service-groups-map'], ['service-groups']],
  );
}
