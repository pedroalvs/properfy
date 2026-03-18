import { usePaginatedQuery } from '@/hooks/useApiQuery';

export interface AuditLogEntry {
  id: string;
  event: string;
  actorName: string;
  reason: string | null;
  createdAt: string;
}

export interface UseAppointmentAuditLogReturn {
  entries: AuditLogEntry[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useAppointmentAuditLog(appointmentId: string | null): UseAppointmentAuditLogReturn {
  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<AuditLogEntry>(
    ['audit-logs', 'appointment', appointmentId],
    '/v1/audit-logs',
    { entityType: 'APPOINTMENT', entityId: appointmentId ?? '', pageSize: 50 },
    { enabled: !!appointmentId },
  );

  return {
    entries: response?.data ?? [],
    isLoading,
    isError,
    refetch,
  };
}
