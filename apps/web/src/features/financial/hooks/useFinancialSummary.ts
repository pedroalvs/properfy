import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';
import type { ApiError } from '@/lib/api-error';
import type { FinancialSummary } from '../types';

export interface UseFinancialSummaryReturn {
  summary: FinancialSummary | null;
  isLoading: boolean;
}

export function useFinancialSummary(tenantId?: string, enabled: boolean = true): UseFinancialSummaryReturn {
  const query = useQuery<{ data: FinancialSummary }, ApiError>({
    queryKey: ['financial-entries', 'summary', tenantId ?? ''],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/v1/financial/entries/summary', {
        params: { query: tenantId ? { tenantId } : {} },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return data as unknown as { data: FinancialSummary };
    },
    enabled,
  });

  return {
    summary: query.data?.data ?? null,
    isLoading: query.isLoading,
  };
}
