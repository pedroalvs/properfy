import { useState } from 'react';
import type { DataTablePagination } from '@/components/data/DataTable';
import { useDetailQuery } from '@/hooks/useApiQuery';
import type { ContactDetail, ContactPropertyAggregate } from '../types';

interface ContactWithProperties extends ContactDetail {
  properties?: {
    data: ContactPropertyAggregate[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  };
}

export interface UseContactPropertiesOptions {
  /** When false, the hook does not fire — used by lazy tab activation. */
  enabled?: boolean;
}

export interface UseContactPropertiesReturn {
  data: ContactPropertyAggregate[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  pagination: DataTablePagination;
}

/**
 * Loads the paginated `properties` aggregation for a contact via the detail
 * endpoint. The default `enabled: false` means callers MUST opt-in (typically
 * gated by tab activation per NFR-103/104).
 */
export function useContactProperties(
  contactId: string | null,
  options: UseContactPropertiesOptions = {},
): UseContactPropertiesReturn {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const query = useDetailQuery<ContactWithProperties>(
    ['contacts', contactId, 'properties', page, pageSize],
    `/v1/contacts/${contactId}?includeProperties=true&propertiesPage=${page}&propertiesPageSize=${pageSize}`,
    { enabled: !!contactId && options.enabled !== false },
  );

  const total = query.data?.data?.properties?.pagination.total ?? 0;
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
    data: query.data?.data?.properties?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error?.message ?? null,
    refetch: query.refetch,
    pagination,
  };
}
