import { useDetailQuery } from '@/hooks/useApiQuery';
import type { Session } from '../types';

export interface UseSessionListReturn {
  sessions: Session[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useSessionList(): UseSessionListReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<Session[]>(
    ['sessions'],
    '/v1/auth/sessions',
  );

  return {
    sessions: (response as any)?.data ?? [],
    isLoading,
    isError,
    refetch,
  };
}
