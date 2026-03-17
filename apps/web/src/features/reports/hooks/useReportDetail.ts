import { useState, useEffect, useCallback } from 'react';
import type { ReportDetail } from '../types';
import { MOCK_REPORTS } from '../mocks/reports';

export interface UseReportDetailReturn {
  report: ReportDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useReportDetail(id: string | null): UseReportDetailReturn {
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadCount, setLoadCount] = useState(0);

  const refetch = useCallback(() => {
    setLoadCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!id) {
      setReport(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => {
      const found = MOCK_REPORTS.find((r) => r.id === id) ?? null;
      setReport(found);
      setIsLoading(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [id, loadCount]);

  return { report, isLoading, isError: false, refetch };
}
