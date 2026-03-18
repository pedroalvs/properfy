import { usePaginatedQuery } from '@/hooks/useApiQuery';

export interface AppointmentNotification {
  id: string;
  channel: string;
  recipient: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
}

export interface UseAppointmentNotificationsReturn {
  notifications: AppointmentNotification[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useAppointmentNotifications(appointmentId: string | null): UseAppointmentNotificationsReturn {
  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<AppointmentNotification>(
    ['notifications', 'appointment', appointmentId],
    '/v1/notifications',
    { appointmentId: appointmentId ?? '', pageSize: 50 },
    { enabled: !!appointmentId },
  );

  return {
    notifications: response?.data ?? [],
    isLoading,
    isError,
    refetch,
  };
}
