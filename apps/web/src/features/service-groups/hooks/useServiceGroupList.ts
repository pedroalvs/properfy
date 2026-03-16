import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type ServiceGroup, type ServiceGroupFiltersState } from '../types';
import { MOCK_SERVICE_GROUPS } from '../mocks/service-groups';

function filterServiceGroups(
  data: ServiceGroup[],
  filters: ServiceGroupFiltersState,
): ServiceGroup[] {
  return data.filter((sg) => {
    if (filters.status && sg.status !== filters.status) return false;

    if (filters.search) {
      const term = filters.search.toLowerCase();
      const matches =
        sg.name.toLowerCase().includes(term) ||
        (sg.regionName?.toLowerCase().includes(term) ?? false) ||
        (sg.inspectorName?.toLowerCase().includes(term) ?? false);
      if (!matches) return false;
    }

    return true;
  });
}

function sortServiceGroups(
  data: ServiceGroup[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): ServiceGroup[] {
  return [...data].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

export interface UseServiceGroupListReturn {
  data: ServiceGroup[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: ServiceGroupFiltersState;
  setFilters: (filters: ServiceGroupFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useServiceGroupList(): UseServiceGroupListReturn {
  const [filters, setFilters] = useState<ServiceGroupFiltersState>(DEFAULT_FILTERS);
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
    () => filterServiceGroups(MOCK_SERVICE_GROUPS, filters),
    [filters],
  );

  const sorted = useMemo(
    () => sortServiceGroups(filtered, sortBy, sortOrder),
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
