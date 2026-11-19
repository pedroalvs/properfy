import { useQuery } from '@tanstack/react-query';
import type { LockedTimeResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { lockedTimeRange } from '../lib/lockedTimeView';

export interface UseLockedTimeReturn {
  data: LockedTimeResponse | null;
  /** The civil-date range actually requested (anchored on `today`, L-F05-09). */
  range: { from: string; to: string };
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

const SIXTY_SECONDS = 60 * 1000;

/**
 * The "Locked time" read (01.13). The range is always anchored on the Live Day
 * server `today` (L-F05-09), independent of the date selected on the Inspectors
 * tab. It never polls (the figure is a near-term planning number, not live state)
 * and is cached for 60s so switching periods back and forth is cheap.
 */
export function useLockedTime(today: string, periodDays: number): UseLockedTimeReturn {
  const range = lockedTimeRange(today, periodDays);

  const query = useQuery({
    queryKey: ['locked-time', range.from, range.to],
    staleTime: SIXTY_SECONDS,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/dashboard/locked-time', {
        params: { query: { from: range.from, to: range.to } },
      });
      if (error) throw error;
      return data;
    },
  });

  return {
    data: (query.data?.data as LockedTimeResponse | undefined) ?? null,
    range,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
