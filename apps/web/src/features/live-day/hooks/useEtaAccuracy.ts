import { useQuery } from '@tanstack/react-query';
import type { RouteEtaAccuracy } from '@properfy/shared';
import { api } from '@/services/api';

export interface UseEtaAccuracyReturn {
  accuracy: RouteEtaAccuracy | null;
  isLoading: boolean;
  isError: boolean;
}

const ETA_ACCURACY_DAYS = 30;
const TEN_MINUTES = 10 * 60 * 1000;

/**
 * The 30-day route-ETA accuracy shown in the Live Day footer (F04). It changes
 * slowly, so it is cached for 10 minutes and never polled — the 30s Live Day
 * poll is only for the live roster.
 */
export function useEtaAccuracy(): UseEtaAccuracyReturn {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['day-plan-eta-accuracy', ETA_ACCURACY_DAYS],
    staleTime: TEN_MINUTES,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/day-plans/eta-accuracy', {
        params: { query: { days: ETA_ACCURACY_DAYS } },
      });
      if (error) throw error;
      return data;
    },
  });

  return {
    accuracy: (data?.data as RouteEtaAccuracy | undefined) ?? null,
    isLoading,
    isError,
  };
}
