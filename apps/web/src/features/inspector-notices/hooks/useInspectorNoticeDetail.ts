import { useMemo } from 'react';
import { useDetailQuery } from '@/hooks/useApiQuery';
import type { InspectorNoticeDetail } from '../types';

export interface UseInspectorNoticeDetailReturn {
  notice: InspectorNoticeDetail | null;
  isLoading: boolean;
  isError: boolean;
  notFound: boolean;
  refetch: () => void;
}

export function useInspectorNoticeDetail(id: string | null): UseInspectorNoticeDetailReturn {
  const { data, isLoading, isError, error, refetch } = useDetailQuery<InspectorNoticeDetail>(
    ['inspector-notices', id],
    `/v1/inspector-notices/${id}`,
    { enabled: !!id },
  );

  const notice = useMemo(() => data?.data ?? null, [data?.data]);
  const notFound = error?.status === 404 || error?.code === 'INSPECTOR_NOTICE_NOT_FOUND';

  return { notice, isLoading, isError, notFound, refetch };
}
