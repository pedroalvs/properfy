import { useQuery } from '@tanstack/react-query';
import type { ReliabilityRankingResponse } from '@properfy/shared';
import { api } from '@/services/api';

export interface UseReliabilityRankingReturn {
  ranking: ReliabilityRankingResponse | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * The current AM/OP reliability ranking (latest snapshot). No parameters — the
 * server derives the 30-day window. Throws on error so the page shows an
 * `ErrorState`; the `['reliability']` key is invalidated when the weights save.
 */
export function useReliabilityRanking(): UseReliabilityRankingReturn {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reliability', 'ranking'],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/dashboard/inspector-performance');
      if (error) throw error;
      return data;
    },
  });

  return {
    ranking: (data?.data as ReliabilityRankingResponse) ?? null,
    isLoading,
    isError,
    refetch,
  };
}
