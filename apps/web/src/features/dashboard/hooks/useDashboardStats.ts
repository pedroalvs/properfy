import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { DashboardStats } from '../types';

export interface UseDashboardStatsReturn {
  stats: DashboardStats | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useDashboardStats(): UseDashboardStatsReturn {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/dashboard/stats');
      if (error) throw error;
      return data;
    },
  });

  return {
    stats: (data?.data as DashboardStats) ?? null,
    isLoading,
    isError,
    refetch,
  };
}
