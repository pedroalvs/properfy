import { useQuery } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/lib/api-client';
import type { DashboardStats } from '../types';

interface DashboardStatsResponse {
  data: DashboardStats;
}

export interface UseDashboardStatsReturn {
  stats: DashboardStats | null;
  isLoading: boolean;
  isError: boolean;
}

export function useDashboardStats(): UseDashboardStatsReturn {
  const { data: response, isLoading, isError } = useQuery<DashboardStatsResponse, ApiError>({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => apiClient.get<DashboardStatsResponse>('/v1/dashboard/stats'),
  });

  return {
    stats: response?.data ?? null,
    isLoading,
    isError,
  };
}
