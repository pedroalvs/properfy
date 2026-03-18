import { useDetailQuery } from '@/hooks/useApiQuery';
import type { FinancialSummary } from '../types';

export interface UseFinancialSummaryReturn {
  summary: FinancialSummary | null;
  isLoading: boolean;
}

export function useFinancialSummary(): UseFinancialSummaryReturn {
  const query = useDetailQuery<FinancialSummary>(
    ['financial-entries', 'summary'],
    '/v1/financial/entries/summary',
  );

  return {
    summary: query.data?.data ?? null,
    isLoading: query.isLoading,
  };
}
