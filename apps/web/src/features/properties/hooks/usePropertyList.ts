import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type Property, type PropertyFiltersState } from '../types';
import { MOCK_PROPERTIES } from '../mocks/properties';

function filterProperties(
  data: Property[],
  filters: PropertyFiltersState,
): Property[] {
  return data.filter((prop) => {
    if (filters.type && prop.type !== filters.type) return false;

    if (filters.branchId && prop.branchId !== filters.branchId) return false;

    if (filters.search) {
      const term = filters.search.toLowerCase();
      const matches =
        prop.propertyCode.toLowerCase().includes(term) ||
        prop.street.toLowerCase().includes(term) ||
        prop.suburb.toLowerCase().includes(term);
      if (!matches) return false;
    }

    return true;
  });
}

function sortProperties(
  data: Property[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): Property[] {
  return [...data].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

export interface UsePropertyListReturn {
  data: Property[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: PropertyFiltersState;
  setFilters: (filters: PropertyFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function usePropertyList(): UsePropertyListReturn {
  const [filters, setFilters] = useState<PropertyFiltersState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('propertyCode');
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
    () => filterProperties(MOCK_PROPERTIES, filters),
    [filters],
  );

  const sorted = useMemo(
    () => sortProperties(filtered, sortBy, sortOrder),
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
