import { useMemo } from 'react';
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

  // PR #961 bug class: FinancialEntryFormDrawer's populate effect depends on this reference —
  // keep any future payload transforms INSIDE this memo so it stays stable per fetch.
  const entry = useMemo(() => query.data?.data ?? null, [query.data?.data]);

  return {
    entry,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
