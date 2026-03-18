import { useState } from 'react';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { usePaginatedQuery } from '@/hooks/useApiQuery';

export interface PropertyAppointment {
  id: string;
  code: string;
  status: string;
  serviceTypeName: string;
  scheduledDate: string;
  timeSlot: string;
  inspectorName: string | null;
  createdAt: string;
}

export interface UsePropertyAppointmentsReturn {
  data: PropertyAppointment[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function usePropertyAppointments(propertyId: string | null): UsePropertyAppointmentsReturn {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const query = usePaginatedQuery<PropertyAppointment>(
    ['property-appointments', propertyId],
    '/v1/appointments',
    {
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(propertyId ? { propertyId } : {}),
    },
    { enabled: !!propertyId },
  );

  const pagination: DataTablePagination = {
    page,
    pageSize,
    total: query.data?.pagination.total ?? 0,
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

  return {
    data: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error?.message ?? null,
    refetch: query.refetch,
    pagination,
    sorting,
  };
}
