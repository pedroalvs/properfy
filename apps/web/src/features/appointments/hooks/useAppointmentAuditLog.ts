import { usePaginatedQuery } from '@/hooks/useApiQuery';

export interface AuditLogEntry {
  id: string;
  tenantId: string | null;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  reason: string | null;
  beforeJson: unknown | null;
  afterJson: unknown | null;
  requestId: string | null;
  ipAddress: string | null;
  metadataJson: unknown | null;
  createdAt: string;
}

export interface UseAppointmentAuditLogReturn {
  entries: AuditLogEntry[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

export function useAppointmentAuditLog(appointmentId: string | null): UseAppointmentAuditLogReturn {
  const { data: response, isLoading, isError, error, refetch } = usePaginatedQuery<AuditLogEntry>(
    ['audit-logs', 'appointment', appointmentId],
    '/v1/audit-logs',
    {
      entityType: 'Appointment',
      entityId: appointmentId ?? '',
      pageSize: 100,
    },
    { enabled: !!appointmentId },
  );

  return {
    entries: response?.data ?? [],
    isLoading,
    isError,
    error,
    refetch,
  };
}
