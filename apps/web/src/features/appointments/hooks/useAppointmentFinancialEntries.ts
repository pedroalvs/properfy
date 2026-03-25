import { usePaginatedQuery } from '@/hooks/useApiQuery';
import type { FinancialEntryType, FinancialEntryStatus } from '@properfy/shared';

export interface AppointmentFinancialEntry {
  id: string;
  entryType: FinancialEntryType;
  amount: number;
  currency: string;
  status: FinancialEntryStatus;
  description: string;
  relatedEntityName: string | null;
  effectiveAt: string;
  reason: string | null;
  approvedByUserId: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface UseAppointmentFinancialEntriesReturn {
  entries: AppointmentFinancialEntry[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useAppointmentFinancialEntries(appointmentId: string | null): UseAppointmentFinancialEntriesReturn {
  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<AppointmentFinancialEntry>(
    ['financial-entries', 'appointment', appointmentId],
    '/v1/financial/entries',
    { appointmentId: appointmentId ?? '', pageSize: 50 },
    { enabled: !!appointmentId },
  );

  return {
    entries: response?.data ?? [],
    isLoading,
    isError,
    refetch,
  };
}
