import { useDetailQuery } from '@/hooks/useApiQuery';
import type { AppointmentFieldActivityResponse } from '@properfy/shared';

export type { AppointmentFieldActivityResponse };

export interface UseAppointmentFieldActivityReturn {
  fieldActivity: AppointmentFieldActivityResponse | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Field activity (F03-2) for the appointment detail: the execution summary plus
 * the descending list of field events.
 *
 * Kept as its own query rather than folded into the appointment detail: the
 * payload is role-shaped (the backend omits inspector coordinates for CL) and
 * the block renders its own loading / empty / error states. The key sits under
 * the shared `['appointments', id]` prefix so the `['appointments']`
 * invalidation that every status transition fires (`useAppointmentTransition`)
 * refreshes the field activity alongside the detail.
 */
export function useAppointmentFieldActivity(id: string | null): UseAppointmentFieldActivityReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<AppointmentFieldActivityResponse>(
    ['appointments', id, 'field-activity'],
    `/v1/appointments/${id}/field-activity`,
    { enabled: !!id },
  );

  return {
    fieldActivity: response?.data ?? null,
    isLoading,
    isError,
    refetch,
  };
}
