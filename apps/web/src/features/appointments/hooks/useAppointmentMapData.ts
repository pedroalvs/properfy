import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';

export interface AppointmentMapItem {
  id: string;
  code: string;
  status: string;
  propertyAddress: string;
  latitude: number;
  longitude: number;
  scheduledDate: string;
  timeSlot: string;
  inspectorName: string | null;
  branchName: string;
  /** Tenant ID — used for cross-tenant operations (e.g. region resolution for AM/OP). */
  tenantId?: string;
  /** Tenant (agency) display name — column 1 of the MapBulkActionModal. */
  clientName?: string;
  /** Primary contact name for the appointment (may be empty when not loaded). */
  contactName?: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  /** Whether the tenant portal has been confirmed; drives the confirmation icons. */
  tenantConfirmationStatus?: string;
  /** Optional service type label surfaced in the detail panel header. */
  serviceTypeName?: string;
  /** Service type id — used to validate homogeneous selection before group creation. */
  serviceTypeId?: string;
  /** Populated when status = REJECTED — surfaces in the detail panel red banner (T-C5-5). */
  rejectionReasonCode?: string | null;
  reason?: string | null;
  /** True when the tenant left a note via the portal. */
  hasTenantNote?: boolean;
  /** Tenant note text — shown as tooltip on the note icon in the bulk modal. */
  tenantNote?: string | null;
  /** Optional service group id used to gate the "Add to group" action. */
  serviceGroupId?: string | null;
  /** Branch id — used to load the correct time slot catalog in the reschedule form. */
  branchId?: string;
}

export interface AppointmentMapFilters {
  status: string;
  dateFrom: string;
  dateTo: string;
  branchId: string;
}

export const DEFAULT_MAP_FILTERS: AppointmentMapFilters = {
  status: '',
  dateFrom: '',
  dateTo: '',
  branchId: '',
};

export interface UseAppointmentMapDataReturn {
  data: AppointmentMapItem[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: AppointmentMapFilters;
  setFilters: (filters: AppointmentMapFilters) => void;
}

export function useAppointmentMapData(): UseAppointmentMapDataReturn {
  const [filters, setFilters] = useState<AppointmentMapFilters>(DEFAULT_MAP_FILTERS);

  const params: ListParams = {
    page: 1,
    pageSize: 100,
    status: filters.status || undefined,
    fromDate: filters.dateFrom || undefined,
    toDate: filters.dateTo || undefined,
    branchId: filters.branchId || undefined,
  };

  const { data: response, isLoading, isError, error, refetch } = usePaginatedQuery<AppointmentMapItem>(
    ['appointments-map'],
    '/v1/appointments',
    params,
  );

  return {
    data: response?.data ?? [],
    isLoading,
    isError,
    errorMessage: error?.message ?? null,
    refetch,
    filters,
    setFilters,
  };
}
