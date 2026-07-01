import { useDetailQuery } from '@/hooks/useApiQuery';
import type { AppointmentDetail } from '../types';

export interface UseAppointmentDetailReturn {
  appointment: AppointmentDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * The API returns custom fields under the opaque `customFieldsJson` field. Coerce
 * it into the typed `customFields` array the UI consumes, tolerating legacy /
 * non-array values (which become an empty list).
 */
function normalizeCustomFields(raw: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (row): row is { label: string; value: string } =>
      !!row &&
      typeof row === 'object' &&
      typeof (row as { label?: unknown }).label === 'string' &&
      typeof (row as { value?: unknown }).value === 'string',
  );
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
