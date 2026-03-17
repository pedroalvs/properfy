import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type TenantContact, type TenantContactFiltersState } from '../types';
import { MOCK_TENANT_CONTACTS } from '../mocks/tenantContacts';

function filterContacts(
  data: TenantContact[],
  filters: TenantContactFiltersState,
): TenantContact[] {
  return data.filter((contact) => {
    if (filters.confirmationStatus && contact.confirmationStatus !== filters.confirmationStatus) return false;

    if (filters.search) {
      const term = filters.search.toLowerCase();
      const matches =
        contact.name.toLowerCase().includes(term) ||
        (contact.primaryEmail?.toLowerCase().includes(term) ?? false) ||
        (contact.primaryPhone?.toLowerCase().includes(term) ?? false);
      if (!matches) return false;
    }

    return true;
  });
}

function sortContacts(
  data: TenantContact[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): TenantContact[] {
  return [...data].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

export interface UseTenantContactListReturn {
  data: TenantContact[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: TenantContactFiltersState;
  setFilters: (filters: TenantContactFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useTenantContactList(): UseTenantContactListReturn {
  const [filters, setFilters] = useState<TenantContactFiltersState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('appointmentDate');
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
    () => filterContacts(MOCK_TENANT_CONTACTS, filters),
    [filters],
  );

  const sorted = useMemo(
    () => sortContacts(filtered, sortBy, sortOrder),
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
