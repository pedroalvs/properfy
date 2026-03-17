import { useState, useEffect } from 'react';
import type { DashboardStats } from '../types';
import { MOCK_DASHBOARD_STATS } from '../mocks/dashboardStats';

export interface UseDashboardStatsReturn {
  stats: DashboardStats | null;
  isLoading: boolean;
  isError: boolean;
}

export function useDashboardStats(): UseDashboardStatsReturn {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setStats(MOCK_DASHBOARD_STATS);
      setIsLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  return { stats, isLoading, isError: false };
}
