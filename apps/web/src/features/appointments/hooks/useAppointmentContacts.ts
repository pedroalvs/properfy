import { usePaginatedQuery } from '@/hooks/useApiQuery';

export interface AppointmentContact {
  id: string;
  appointmentId: string;
  name: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  confirmationStatus: string;
  propertyAddress: string;
  appointmentDate: string;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UseAppointmentContactsReturn {
  contacts: AppointmentContact[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useAppointmentContacts(
  tenantId: string | null,
  filters?: { confirmationStatus?: string; search?: string },
): UseAppointmentContactsReturn {
  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<AppointmentContact>(
    ['appointment-contacts', tenantId, filters],
    '/v1/appointment-contacts',
    {
      page: 1,
      pageSize: 50,
      tenantId: tenantId ?? undefined,
      confirmationStatus: filters?.confirmationStatus || undefined,
      search: filters?.search || undefined,
    },
    { enabled: !!tenantId },
  );

  return {
    contacts: response?.data ?? [],
    isLoading,
    isError,
    refetch,
  };
}
