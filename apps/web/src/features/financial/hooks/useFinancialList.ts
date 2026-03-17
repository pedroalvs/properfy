import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type FinancialEntry, type FinancialFiltersState } from '../types';
import { MOCK_FINANCIAL_ENTRIES } from '../mocks/financialEntries';

function filterEntries(
  data: FinancialEntry[],
  filters: FinancialFiltersState,
): FinancialEntry[] {
  return data.filter((entry) => {
    if (filters.entryType && entry.entryType !== filters.entryType) return false;
    if (filters.status && entry.status !== filters.status) return false;

    if (filters.search) {
      const term = filters.search.toLowerCase();
      const matches =
        entry.description.toLowerCase().includes(term) ||
        entry.appointmentCode.toLowerCase().includes(term);
      if (!matches) return false;
    }

    return true;
  });
}

function sortEntries(
  data: FinancialEntry[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): FinancialEntry[] {
  return [...data].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

export interface UseFinancialListReturn {
  data: FinancialEntry[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: FinancialFiltersState;
  setFilters: (filters: FinancialFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useFinancialList(): UseFinancialListReturn {
  const [filters, setFilters] = useState<FinancialFiltersState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('effectiveAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const simulateLoad = useCallback(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    return simulateLoad();
  }, [simulateLoad]);

  const filtered = useMemo(
    () => filterEntries(MOCK_FINANCIAL_ENTRIES, filters),
    [filters],
  );

  const sorted = useMemo(
    () => sortEntries(filtered, sortBy, sortOrder),
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
