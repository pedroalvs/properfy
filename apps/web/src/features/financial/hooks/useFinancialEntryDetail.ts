import { useState, useEffect, useCallback } from 'react';
import type { FinancialEntryDetail } from '../types';
import { MOCK_FINANCIAL_ENTRIES } from '../mocks/financialEntries';

export interface UseFinancialEntryDetailReturn {
  entry: FinancialEntryDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useFinancialEntryDetail(id: string | null): UseFinancialEntryDetailReturn {
  const [entry, setEntry] = useState<FinancialEntryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadCount, setLoadCount] = useState(0);

  const refetch = useCallback(() => {
    setLoadCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!id) {
      setEntry(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => {
      const found = MOCK_FINANCIAL_ENTRIES.find((e) => e.id === id) ?? null;
      setEntry(found);
      setIsLoading(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [id, loadCount]);

  return { entry, isLoading, isError: false, refetch };
}
