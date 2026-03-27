import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
import type { SelectOption } from '@/components/forms/SelectInput';

interface EffectiveSlot {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  value: string;
}

export function useTimeSlotOptions(branchId: string | undefined) {
  const enabled = !!branchId;

  const query = useQuery<SelectOption[]>({
    queryKey: ['time-slots', 'effective', branchId],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/time-slots/effective' as any, {
        params: { query: { branchId } as any },
      });
      if (error) {
        const err = error as any;
        throw new ApiError(
          err?.error?.statusCode ?? 500,
          err?.error?.message ?? 'Failed to load time slots',
          err?.error?.code,
        );
      }

      const slots = ((data as any)?.data ?? []) as EffectiveSlot[];
      return slots.map((s) => ({
        label: `${s.label} (${s.startTime} - ${s.endTime})`,
        value: s.value,
      }));
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  return {
    options: query.data ?? [],
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    error: query.error instanceof ApiError ? query.error.message : query.error ? 'Failed to load time slots' : null,
    refetch: query.refetch,
  };
}
