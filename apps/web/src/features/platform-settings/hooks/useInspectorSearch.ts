import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePaginatedQuery } from '@/hooks/useApiQuery';

export interface InspectorOption {
  id: string;
  name: string;
}

export interface UseInspectorSearchReturn {
  search: string;
  debouncedSearch: string;
  /** First page (max 20) of ACTIVE inspectors for the current debounced search. */
  results: InspectorOption[];
  /** Total matching the current search — drives the "type to search more" hint. */
  total: number;
  isSearching: boolean;
  setSearch: (value: string) => void;
  reset: () => void;
}

const PAGE_SIZE = 20;

/**
 * Debounced (300 ms) server-side search over `/v1/inspectors?status=ACTIVE`
 * (L-F04-14). Never a `pageSize=100` fetch that would silently hide inspector
 * #101+: the server `search` param narrows, and `total` lets the consumer tell
 * the operator when more exist than the page shows.
 */
export function useInspectorSearch(enabled = true): UseInspectorSearchReturn {
  const [search, setSearchState] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const { data, isLoading: isSearching } = usePaginatedQuery<InspectorOption>(
    ['inspectors', 'inspector-select', debouncedSearch],
    '/v1/inspectors',
    {
      page: 1,
      pageSize: PAGE_SIZE,
      status: 'ACTIVE',
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
    },
    { enabled, staleTime: 30_000 },
  );

  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  }, []);

  const reset = useCallback(() => {
    setSearchState('');
    setDebouncedSearch('');
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Referential stability (web CLAUDE.md §11): key the derived array on the raw
  // query payload so consumers' effects don't see a new array every render.
  const results = useMemo(() => data?.data ?? [], [data]);

  return {
    search,
    debouncedSearch,
    results,
    total: data?.pagination.total ?? 0,
    isSearching,
    setSearch,
    reset,
  };
}
