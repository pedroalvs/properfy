import { useDetailQuery } from '@/hooks/useApiQuery';
import type { ReportDetail } from '../types';

export interface UseReportDetailReturn {
  report: ReportDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useReportDetail(id: string | null): UseReportDetailReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<ReportDetail>(
    ['reports', id],
    `/v1/reports/${id}`,
    { enabled: !!id },
  );

  return {
    report: response?.data ?? null,
    isLoading,
    isError,
    refetch,
  };
}
