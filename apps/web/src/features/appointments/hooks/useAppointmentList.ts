import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppointmentStatus } from '@properfy/shared';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type Appointment, type AppointmentFiltersState } from '../types';
import { MOCK_APPOINTMENTS } from '../mocks/appointments';

function filterAppointments(
  data: Appointment[],
  filters: AppointmentFiltersState,
): Appointment[] {
  return data.filter((apt) => {
    if (!filters.showCancelled && apt.status === AppointmentStatus.CANCELLED) return false;

    if (filters.status && apt.status !== filters.status) return false;

    if (filters.branchId && apt.branchId !== filters.branchId) return false;

    if (filters.search) {
      const term = filters.search.toLowerCase();
      const matches =
        apt.code.toLowerCase().includes(term) ||
        apt.propertyAddress.toLowerCase().includes(term) ||
        apt.contactName.toLowerCase().includes(term);
      if (!matches) return false;
    }

    if (filters.startDate && apt.scheduledDate < filters.startDate) return false;
    if (filters.endDate && apt.scheduledDate > filters.endDate) return false;

    return true;
  });
}

function sortAppointments(
  data: Appointment[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): Appointment[] {
  return [...data].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

export interface UseAppointmentListReturn {
  data: Appointment[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: AppointmentFiltersState;
  setFilters: (filters: AppointmentFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useAppointmentList(): UseAppointmentListReturn {
  const [filters, setFilters] = useState<AppointmentFiltersState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('scheduledDate');
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
    () => filterAppointments(MOCK_APPOINTMENTS, filters),
    [filters],
  );

  const sorted = useMemo(
    () => sortAppointments(filtered, sortBy, sortOrder),
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
