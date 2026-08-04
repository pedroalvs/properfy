import { useQuery } from '@tanstack/react-query';
import type { InspectorWorkloadResponse } from '@properfy/shared';
import { api } from '@/services/api';

export interface UseInspectorWorkloadReturn {
  workload: InspectorWorkloadResponse | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * One week of inspector workload. Keyed on `weekStart` alone — the server
 * derives the comparison weeks and the month figures from it, so nothing else
 * varies the response.
 */
export function useInspectorWorkload(weekStart: string): UseInspectorWorkloadReturn {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['inspector-workload', weekStart],
    enabled: Boolean(weekStart),
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/dashboard/inspector-workload', {
        params: { query: { weekStart } },
      });
      if (error) throw error;
      return data;
    },
  });

  return {
    workload: (data?.data as InspectorWorkloadResponse) ?? null,
    isLoading,
    isError,
    refetch,
  };
}
