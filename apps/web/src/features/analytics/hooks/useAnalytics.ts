import { useQuery } from '@tanstack/react-query';
import type { AnalyticsHeatmapResponse, DashboardAnalyticsResponse } from '@properfy/shared';
import { api } from '@/services/api';

interface Period {
  startDate: string;
  endDate: string;
  enabled?: boolean;
}

export interface UseAnalyticsReturn {
  analytics: DashboardAnalyticsResponse | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useAnalytics({ startDate, endDate, enabled = true }: Period): UseAnalyticsReturn {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics', 'summary', startDate, endDate],
    enabled: enabled && Boolean(startDate && endDate),
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/dashboard/analytics', {
        params: { query: { startDate, endDate } },
      });
      if (error) throw error;
      return data;
    },
  });

  return {
    analytics: (data?.data as DashboardAnalyticsResponse) ?? null,
    isLoading,
    isError,
    refetch,
  };
}

export interface UseAnalyticsHeatmapReturn {
  heatmap: AnalyticsHeatmapResponse | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Separate query from the summary: the heatmap's size follows the number of
 * distinct suburbs the period touches, and its card renders independently.
 */
export function useAnalyticsHeatmap({ startDate, endDate, enabled = true }: Period): UseAnalyticsHeatmapReturn {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'heatmap', startDate, endDate],
    enabled: enabled && Boolean(startDate && endDate),
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/dashboard/analytics/heatmap', {
        params: { query: { startDate, endDate } },
      });
      if (error) throw error;
      return data;
    },
  });

  return {
    heatmap: (data?.data as AnalyticsHeatmapResponse) ?? null,
    isLoading,
    isError,
  };
}
