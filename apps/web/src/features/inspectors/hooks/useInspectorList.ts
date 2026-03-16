import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type Inspector, type InspectorFiltersState } from '../types';
import { MOCK_INSPECTORS } from '../mocks/inspectors';

function filterInspectors(
  data: Inspector[],
  filters: InspectorFiltersState,
): Inspector[] {
  return data.filter((insp) => {
    if (filters.status && insp.status !== filters.status) return false;

    if (filters.search) {
      const term = filters.search.toLowerCase();
      const matches =
        insp.name.toLowerCase().includes(term) ||
        insp.email.toLowerCase().includes(term) ||
        (insp.phone?.toLowerCase().includes(term) ?? false);
      if (!matches) return false;
    }

    return true;
  });
}

function sortInspectors(
  data: Inspector[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): Inspector[] {
  return [...data].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

export interface UseInspectorListReturn {
  data: Inspector[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: InspectorFiltersState;
  setFilters: (filters: InspectorFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useInspectorList(): UseInspectorListReturn {
  const [filters, setFilters] = useState<InspectorFiltersState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const simulateLoad = useCallback(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    return simulateLoad();
  }, [simulateLoad]);

  const filtered = useMemo(
    () => filterInspectors(MOCK_INSPECTORS, filters),
    [filters],
  );

  const sorted = useMemo(
    () => sortInspectors(filtered, sortBy, sortOrder),
    [filtered, sortBy, sortOrder],
  );

  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  const pagination: DataTablePagination = {
    page,
    pageSize,
    total: filtered.length,
    onChange: (newPage, newPageSize) => {
      setPage(newPage);
      setPageSize(newPageSize);
    },
  };

  const sorting: DataTableSorting = {
    sortBy,
    sortOrder,
    onChange: (newSortBy, newSortOrder) => {
      setSortBy(newSortBy);
      setSortOrder(newSortOrder);
    },
  };

  const refetch = useCallback(() => {
    simulateLoad();
  }, [simulateLoad]);

  return {
    data: isLoading ? [] : paginatedData,
    isLoading,
    isError: false,
    errorMessage: null,
    refetch,
    filters,
    setFilters,
    pagination,
    sorting,
  };
}
