import { usePaginatedQuery } from '@/hooks/useApiQuery';

/** Minimal row — only the pagination total is read. */
interface InspectorCountRow {
  id: string;
}

export interface UseActiveInspectorCountReturn {
  /** Total ACTIVE inspectors, or `null` when unknown (loading or failed). */
  count: number | null;
  isLoading: boolean;
}

/**
 * The ACTIVE inspector count used as the SMS ceiling for the "All active
 * inspectors" audience in the critical ConfirmDialog (L-F02-01). Fetched with
 * `pageSize=1` — only `pagination.total` matters. Only enabled when the ALL
 * audience is chosen; on failure `count` stays `null` so the dialog falls back
 * to the no-number phrase and publishing is never blocked.
 */
export function useActiveInspectorCount(enabled: boolean): UseActiveInspectorCountReturn {
  const query = usePaginatedQuery<InspectorCountRow>(
    ['inspector-notices', 'active-count'],
    '/v1/inspectors',
    { status: 'ACTIVE', page: 1, pageSize: 1 },
    { enabled },
  );

  return {
    count: query.isSuccess ? (query.data?.pagination.total ?? null) : null,
    isLoading: query.isLoading,
  };
}
