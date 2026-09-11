import { useState, useRef, useEffect, useCallback } from 'react';
import { usePaginatedQuery } from '@/hooks/useApiQuery';

export interface AgencyOption {
  id: string;
  name: string;
}

export interface UseAgencySearchReturn {
  search: string;
  debouncedSearch: string;
  /** First page (max 100) of agencies for the current debounced search. */
  results: AgencyOption[];
  /** Total matching the current search — drives the "type to search more" hint. */
  total: number;
  isSearching: boolean;
  setSearch: (value: string) => void;
  reset: () => void;
}

/**
 * Debounced (300 ms) server-side agency search over `/v1/tenants`. An empty
 * search returns the first 100 agencies alphabetically; `total` lets the
 * consumer tell the operator when more exist than the page shows, instead of
 * silently capping the list.
 */
export function useAgencySearch(enabled = true): UseAgencySearchReturn {
  const [search, setSearchState] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const { data, isLoading: isSearching } = usePaginatedQuery<AgencyOption>(
    ['tenants', 'agency-select', debouncedSearch],
    '/v1/tenants',
    {
      page: 1,
      pageSize: 100,
      sortBy: 'name',
      sortOrder: 'asc',
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

  return {
    search,
    debouncedSearch,
    results: data?.data ?? [],
    total: data?.pagination.total ?? 0,
    isSearching,
    setSearch,
    reset,
  };
}
