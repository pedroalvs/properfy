import { useDetailQuery } from '@/hooks/useApiQuery';

export interface AppointmentContactDetail {
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
  alternativePhone: string | null;
  notes: string | null;
}

export interface UseAppointmentContactDetailReturn {
  contact: AppointmentContactDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useAppointmentContactDetail(
  contactId: string | null,
): UseAppointmentContactDetailReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<AppointmentContactDetail>(
    ['appointment-contacts', contactId],
    `/v1/appointment-contacts/${contactId}`,
    { enabled: !!contactId },
  );

  return {
    contact: response?.data ?? null,
    isLoading,
    isError,
    refetch,
  };
}
