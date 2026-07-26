import { useMemo } from 'react';
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
  // Memoized so consumers get a referentially stable object per fetch result.
  // AppointmentFormDrawer's populate effect depends on this reference; a fresh
  // object every render re-triggers its setState calls in an infinite loop
  // that starves router re-renders (URL changes but the screen never swaps).
  const appointment: AppointmentDetail | null = useMemo(
    () =>
      raw
        ? {
            ...raw,
            customFields: normalizeCustomFields(raw.customFieldsJson),
          }
        : null,
    [raw],
  );

  return {
    appointment,
    isLoading,
    isError,
    refetch,
  };
}
