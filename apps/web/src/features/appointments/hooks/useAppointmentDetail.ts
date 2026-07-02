import { useDetailQuery } from '@/hooks/useApiQuery';
import { normalizeCustomFields } from '@properfy/shared';
import type { AppointmentDetail } from '../types';

export interface UseAppointmentDetailReturn {
  appointment: AppointmentDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * The wire shape actually returned by the API: custom fields arrive under the
 * opaque `customFieldsJson` (not the normalized `customFields`). Typing the query
 * with this makes any accidental read of `raw.customFields` a compile error.
 */
type RawAppointmentDetail = Omit<AppointmentDetail, 'customFields'> & { customFieldsJson?: unknown };

export function useAppointmentDetail(id: string | null): UseAppointmentDetailReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<RawAppointmentDetail>(
    ['appointments', id],
    `/v1/appointments/${id}`,
    { enabled: !!id },
  );

  const raw = response?.data ?? null;
  const appointment: AppointmentDetail | null = raw
    ? {
        ...raw,
        customFields: normalizeCustomFields(raw.customFieldsJson),
      }
    : null;

  return {
    appointment,
    isLoading,
    isError,
    refetch,
  };
}
