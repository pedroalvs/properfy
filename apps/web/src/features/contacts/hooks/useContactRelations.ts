import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDetailQuery } from '@/hooks/useApiQuery';
import type {
  ContactDetail,
  ContactAppointmentItem,
  ContactPropertyAggregate,
} from '../types';

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Combined response shape for
 * `GET /v1/contacts/:id?includeProperties=true&includeAppointments=true`.
 * Both sub-resources are paginated independently (the route accepts
 * `propertiesPage`/`appointmentsPage` + `*PageSize`).
 */
interface ContactRelationsResponse extends ContactDetail {
  properties?: { data: ContactPropertyAggregate[]; pagination: PaginationMeta };
  appointments?: { data: ContactAppointmentItem[]; pagination: PaginationMeta };
}

const DEFAULT_PAGE_SIZE = 20;

export interface UseContactRelationsOptions {
  /**
   * Lazy fetch — defaults to `false`. The hook only fires when `enabled` is
   * explicitly `true` (NFR-204 lazy tab activation). The caller passes
   * `tab === 'relations'`.
   */
  enabled?: boolean;
  /** Page size per sub-resource; defaults to 20. */
  propertiesPageSize?: number;
  appointmentsPageSize?: number;
}

export interface UseContactRelationsReturn {
  contact: ContactDetail | null;
  properties: ContactPropertyAggregate[];
  appointments: ContactAppointmentItem[];
  propertiesPagination: PaginationMeta | null;
  appointmentsPagination: PaginationMeta | null;
  hasMoreProperties: boolean;
  hasMoreAppointments: boolean;
  loadMoreProperties: () => void;
  loadMoreAppointments: () => void;
  isLoading: boolean;
  /** True while any page (initial or a load-more) is in flight. */
  isFetching: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
}

/**
 * Combined fetch backing the Relations tab on the contact detail page
 * (023 §FR-211/213). Lazy-gated via `enabled` (NFR-204). Pages each
 * sub-resource independently and accumulates the fetched pages in order so a
 * contact with more than one page of properties/appointments is never
 * silently truncated (#220).
 */
export function useContactRelations(
  contactId: string | null,
  options: UseContactRelationsOptions = {},
): UseContactRelationsReturn {
  const enabled = !!contactId && options.enabled === true;
  const propertiesPageSize = options.propertiesPageSize ?? DEFAULT_PAGE_SIZE;
  const appointmentsPageSize = options.appointmentsPageSize ?? DEFAULT_PAGE_SIZE;

  const [propertiesPage, setPropertiesPage] = useState(1);
  const [appointmentsPage, setAppointmentsPage] = useState(1);
  const [propsByPage, setPropsByPage] = useState<Record<number, ContactPropertyAggregate[]>>({});
  const [apptsByPage, setApptsByPage] = useState<Record<number, ContactAppointmentItem[]>>({});
  const [propertiesPagination, setPropertiesPagination] = useState<PaginationMeta | null>(null);
  const [appointmentsPagination, setAppointmentsPagination] = useState<PaginationMeta | null>(null);

  // Reset all pagination state when the contact changes (render-time
  // previous-id pattern) so contact B never inherits contact A's pages.
  const [seenContactId, setSeenContactId] = useState(contactId);
  if (contactId !== seenContactId) {
    setSeenContactId(contactId);
    setPropertiesPage(1);
    setAppointmentsPage(1);
    setPropsByPage({});
    setApptsByPage({});
    setPropertiesPagination(null);
    setAppointmentsPagination(null);
  }

  const query = useDetailQuery<ContactRelationsResponse>(
    ['contacts', contactId, 'relations', propertiesPageSize, appointmentsPageSize, propertiesPage, appointmentsPage],
    `/v1/contacts/${contactId}?includeProperties=true&includeAppointments=true` +
      `&propertiesPage=${propertiesPage}&propertiesPageSize=${propertiesPageSize}` +
      `&appointmentsPage=${appointmentsPage}&appointmentsPageSize=${appointmentsPageSize}`,
    { enabled },
  );

  // Store each fetched page keyed by its page number (idempotent — the combined
  // endpoint re-returns the other sub-resource's page 1 when only one advances).
  useEffect(() => {
    const payload = query.data?.data;
    if (!payload) return;
    if (payload.properties) {
      const { data, pagination } = payload.properties;
      setPropsByPage((prev) => (prev[propertiesPage] === data ? prev : { ...prev, [propertiesPage]: data }));
      setPropertiesPagination(pagination);
    }
    if (payload.appointments) {
      const { data, pagination } = payload.appointments;
      setApptsByPage((prev) => (prev[appointmentsPage] === data ? prev : { ...prev, [appointmentsPage]: data }));
      setAppointmentsPagination(pagination);
    }
  }, [query.data, propertiesPage, appointmentsPage]);

  const properties = useMemo(
    () =>
      Object.keys(propsByPage)
        .map(Number)
        .sort((a, b) => a - b)
        .flatMap((page) => propsByPage[page] ?? []),
    [propsByPage],
  );
  const appointments = useMemo(
    () =>
      Object.keys(apptsByPage)
        .map(Number)
        .sort((a, b) => a - b)
        .flatMap((page) => apptsByPage[page] ?? []),
    [apptsByPage],
  );

  const hasMoreProperties = propertiesPagination
    ? propertiesPagination.page < propertiesPagination.totalPages
    : false;
  const hasMoreAppointments = appointmentsPagination
    ? appointmentsPagination.page < appointmentsPagination.totalPages
    : false;

  const loadMoreProperties = useCallback(() => {
    if (!query.isFetching && hasMoreProperties) setPropertiesPage((p) => p + 1);
  }, [query.isFetching, hasMoreProperties]);
  const loadMoreAppointments = useCallback(() => {
    if (!query.isFetching && hasMoreAppointments) setAppointmentsPage((p) => p + 1);
  }, [query.isFetching, hasMoreAppointments]);

  return {
    contact: query.data?.data ?? null,
    properties,
    appointments,
    propertiesPagination,
    appointmentsPagination,
    hasMoreProperties,
    hasMoreAppointments,
    loadMoreProperties,
    loadMoreAppointments,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    errorMessage: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
