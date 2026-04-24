import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
import type { PaginatedResponse } from '@/hooks/useApiQuery';

export interface ContactSearchResult {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  type: string;
  isActive: boolean;
}

function useContactSearchQuery(search: string, tenantId: string | undefined, enabled: boolean) {
  return useQuery<ContactSearchResult[], ApiError>({
    queryKey: ['contacts', 'search', search, tenantId],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/contacts' as any, {
        params: { query: { search, pageSize: '10', isActive: 'true', ...(tenantId ? { tenantId } : {}) } as any },
      });
      if (error) {
        throw new ApiError(
          (error as any).status ?? 500,
          (error as any).message ?? 'Failed to search contacts',
        );
      }
      const response = data as unknown as PaginatedResponse<ContactSearchResult>;
      return response.data;
    },
    enabled: enabled && search.length >= 2 && !!tenantId,
    staleTime: 30_000,
  });
}

export interface UseContactSearchReturn {
  search: string;
  debouncedSearch: string;
  results: ContactSearchResult[];
  isSearching: boolean;
  setSearch: (value: string) => void;
  reset: () => void;
}

export function useContactSearch(enabled = true, tenantId?: string): UseContactSearchReturn {
  const [search, setSearchState] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const { data: results = [], isLoading: isSearching } = useContactSearchQuery(
    debouncedSearch,
    tenantId,
    enabled,
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

  return { search, debouncedSearch, results, isSearching, setSearch, reset };
}
