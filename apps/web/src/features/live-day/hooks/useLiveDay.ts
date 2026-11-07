import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { LiveDayResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { isLiveDate } from '../lib/liveDayView';

/** Which routes' geometry the request should carry (D18). */
export type GeometryMode = 'none' | 'selected' | 'all';

export interface UseLiveDayArgs {
  /** `null` → the server defaults to the actor's civil today (the request omits `date`). */
  date: string | null;
  geometryMode: GeometryMode;
  /** The selected inspector; only sent when `geometryMode === 'selected'`. */
  selectedId: string | null;
}

export interface UseLiveDayReturn {
  liveDay: LiveDayResponse | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  isRefetchError: boolean;
  dataUpdatedAt: number;
  /** Today or tomorrow in the server's frame — the screen polls only then (L-F05-05). */
  isLive: boolean;
  error: unknown;
  refetch: () => void;
}

const POLL_MS = 30_000;

/**
 * The Live Day read. Polls every 30s only while the day is live and the tab is
 * visible (D3); `keepPreviousData` keeps the list/route on screen while a
 * selection, mode or date change refetches, so nothing flickers. The query key
 * depends on the geometry mode and the selected inspector (D18) so a 30s poll
 * never carries geometry the screen is not drawing.
 */
export function useLiveDay({ date, geometryMode, selectedId }: UseLiveDayArgs): UseLiveDayReturn {
  const query = useQuery({
    queryKey: ['live-day', date, geometryMode, selectedId],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const q: { date?: string; includeGeometry: GeometryMode; inspectorId?: string } = {
        includeGeometry: geometryMode,
      };
      if (date) q.date = date;
      if (geometryMode === 'selected' && selectedId) q.inspectorId = selectedId;
      const { data, error } = await api.GET('/v1/dashboard/live-day', { params: { query: q } });
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => {
      const today = (q.state.data as { data?: LiveDayResponse } | undefined)?.data?.today ?? null;
      return isLiveDate(date, today) ? POLL_MS : false;
    },
    refetchIntervalInBackground: false,
  });

  const liveDay = (query.data?.data as LiveDayResponse | undefined) ?? null;

  return {
    liveDay,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    isRefetchError: query.isRefetchError,
    dataUpdatedAt: query.dataUpdatedAt,
    isLive: isLiveDate(date, liveDay?.today ?? null),
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
