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
 * Combined response shape for `GET /v1/contacts/:id?includeProperties=true&includeAppointments=true`.
 * Both sub-resources are paginated; the Relations tab groups appointments by
 * propertyId client-side so a single fetch is sufficient (023 §FR-211).
 */
interface ContactRelationsResponse extends ContactDetail {
  properties?: { data: ContactPropertyAggregate[]; pagination: PaginationMeta };
  appointments?: { data: ContactAppointmentItem[]; pagination: PaginationMeta };
}

export interface UseContactRelationsOptions {
  /** Lazy fetch — defaults to `false`. Caller passes `tab === 'relations'`. */
  enabled?: boolean;
  /** Optional pagination overrides; defaults to `pageSize=100` for both. */
  propertiesPageSize?: number;
  appointmentsPageSize?: number;
}

export interface UseContactRelationsReturn {
  contact: ContactDetail | null;
  properties: ContactPropertyAggregate[];
  appointments: ContactAppointmentItem[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
}

/**
 * Single combined fetch backing the Relations tab on the contact detail page
 * (023 §FR-211/213). Lazy-gated via the `enabled` flag (NFR-204) so the tab
 * does not fire any request until activated.
 */
export function useContactRelations(
  contactId: string | null,
  options: UseContactRelationsOptions = {},
): UseContactRelationsReturn {
  const propertiesPageSize = options.propertiesPageSize ?? 100;
  const appointmentsPageSize = options.appointmentsPageSize ?? 100;

  const query = useDetailQuery<ContactRelationsResponse>(
    ['contacts', contactId, 'relations', propertiesPageSize, appointmentsPageSize],
    `/v1/contacts/${contactId}?includeProperties=true&includeAppointments=true&propertiesPageSize=${propertiesPageSize}&appointmentsPageSize=${appointmentsPageSize}`,
    { enabled: !!contactId && options.enabled !== false },
  );

  return {
    contact: query.data?.data ?? null,
    properties: query.data?.data?.properties?.data ?? [],
    appointments: query.data?.data?.appointments?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
