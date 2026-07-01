import { useState } from 'react';
import type { DataTablePagination } from '@/components/data/DataTable';
import { usePaginatedQuery } from '@/hooks/useApiQuery';

export interface PropertyAppointment {
  id: string;
  code: string;
  status: string;
  serviceTypeName: string;
  scheduledDate: string;
  timeSlotStart: string;
  timeSlotEnd: string;
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
}

export function usePropertyAppointments(propertyId: string | null): UsePropertyAppointmentsReturn {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const query = usePaginatedQuery<PropertyAppointment>(
    ['property-appointments', propertyId],
    '/v1/appointments',
    {
      page,
      pageSize,
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

  return {
    data: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error?.message ?? null,
    refetch: query.refetch,
    pagination,
  };
}
