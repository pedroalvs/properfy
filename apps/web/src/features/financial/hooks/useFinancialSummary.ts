import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
import type { FinancialSummary } from '../types';

export interface UseFinancialSummaryReturn {
  summary: FinancialSummary | null;
  isLoading: boolean;
}

export function useFinancialSummary(tenantId?: string, enabled: boolean = true): UseFinancialSummaryReturn {
  const query = useQuery<{ data: FinancialSummary }, ApiError>({
    queryKey: ['financial-entries', 'summary', tenantId ?? ''],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/financial/entries/summary' as any, {
        params: { query: tenantId ? { tenantId } : undefined } as any,
      });
      if (error) {
        const apiError = error as { status?: number; message?: string };
        throw new ApiError(apiError.status ?? 500, apiError.message ?? 'Failed to load summary');
      }
      return data as { data: FinancialSummary };
    },
    enabled,
  });

  return {
    summary: query.data?.data ?? null,
    isLoading: query.isLoading,
  };
}
