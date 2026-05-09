import { useState } from 'react';
import type { DataTablePagination } from '@/components/data/DataTable';
import { useDetailQuery } from '@/hooks/useApiQuery';
import type { ContactDetail, ContactAppointmentItem } from '../types';

interface ContactWithAppointments extends ContactDetail {
  appointments?: {
    data: ContactAppointmentItem[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  };
}

export interface UseContactAppointmentsOptions {
  /** When false, the hook does not fire — used by lazy tab activation. */
  enabled?: boolean;
}

export interface UseContactAppointmentsReturn {
  data: ContactAppointmentItem[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  pagination: DataTablePagination;
}

export function useContactAppointments(
  contactId: string | null,
  options: UseContactAppointmentsOptions = {},
): UseContactAppointmentsReturn {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const query = useDetailQuery<ContactWithAppointments>(
    ['contacts', contactId, 'appointments', page, pageSize],
    `/v1/contacts/${contactId}?includeAppointments=true&appointmentsPage=${page}&appointmentsPageSize=${pageSize}`,
    { enabled: !!contactId && options.enabled !== false },
  );

  const total = query.data?.data?.appointments?.pagination.total ?? 0;
  const pagination: DataTablePagination = {
    page,
    pageSize,
    total,
    onChange: (newPage, newPageSize) => {
      setPage(newPage);
      setPageSize(newPageSize);
    },
  };

  return {
    data: query.data?.data?.appointments?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error?.message ?? null,
    refetch: query.refetch,
    pagination,
  };
}
