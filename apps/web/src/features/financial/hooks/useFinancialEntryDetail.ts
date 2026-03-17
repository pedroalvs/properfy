import { useDetailQuery } from '@/hooks/useApiQuery';
import type { FinancialEntryDetail } from '../types';

export interface UseFinancialEntryDetailReturn {
  entry: FinancialEntryDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useFinancialEntryDetail(id: string | null): UseFinancialEntryDetailReturn {
  const query = useDetailQuery<FinancialEntryDetail>(
    ['financial-entries', id],
    `/v1/financial/entries/${id}`,
    { enabled: !!id },
  );

  return {
    entry: query.data?.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
