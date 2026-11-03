import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { PreviewDayPlanOrderResponse } from '@properfy/shared';
import { apiPost, type SuccessResponse } from '@/hooks/useApiQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { dayPlanKeys } from '../api/day-plan-keys';
import { classifyPreviewReason, type PreviewSlice } from '../lib/reorder-preview';

interface Options {
  /** Caller gate (route not past, reorder available, online). */
  enabled: boolean;
  /** 400 ms for the live draft order; 0 for the stable suggested baseline. */
  debounceMs: number;
}

/**
 * Evaluate a candidate stop order on the server (`POST …/order/preview`, F04 Plan
 * B). The order fed into the query key is debounced so a burst of drags makes one
 * request; the key is version-pinned and order-sensitive, so the result is cached
 * per order and a superseded order can never render out of turn. Returns a pure
 * {@link PreviewSlice} the view builder folds; this hook makes no decisions.
 */
export function usePreviewDayPlanOrder(
  date: string,
  version: number,
  order: readonly string[],
  { enabled, debounceMs }: Options,
): PreviewSlice {
  // Debounce by value (the joined key is stable across identical orders), then
  // rebuild the id array — UUIDs never contain commas.
  const debouncedKey = useDebouncedValue(order.join(','), debounceMs);
  const debouncedOrder = useMemo(() => (debouncedKey ? debouncedKey.split(',') : []), [debouncedKey]);

  const active = enabled && debouncedOrder.length >= 2;

  const query = useQuery({
    queryKey: dayPlanKeys.orderPreview(date, version, debouncedOrder),
    queryFn: async () => {
      const res = await apiPost<SuccessResponse<PreviewDayPlanOrderResponse>>(
        `/v1/inspector/day-plans/${date}/order/preview`,
        { appointmentIds: debouncedOrder, basedOnVersion: version },
      );
      return res.data;
    },
    enabled: active,
    // An evaluated (date, version, order) is deterministic — never auto-refetch it.
    staleTime: Infinity,
    retry: false,
    placeholderData: keepPreviousData,
  });

  return useMemo<PreviewSlice>(() => {
    if (!active) return { phase: 'IDLE', data: null, reason: null };
    if (query.isError) return { phase: 'ERROR', data: null, reason: classifyPreviewReason(query.error) };
    if (query.isFetching) return { phase: 'LOADING', data: query.data ?? null, reason: null };
    if (query.isSuccess) return { phase: 'SUCCESS', data: query.data, reason: null };
    return { phase: 'IDLE', data: null, reason: null };
  }, [active, query.isError, query.isFetching, query.isSuccess, query.data, query.error]);
}
