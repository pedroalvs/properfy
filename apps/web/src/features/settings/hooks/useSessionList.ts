import { useDetailQuery } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';
import type { Session } from '../types';

export interface UseSessionListReturn {
  sessions: Session[];
  isLoading: boolean;
  isError: boolean;
  isNotFound: boolean;
  refetch: () => void;
}

export function useSessionList(): UseSessionListReturn {
  const { data: response, isLoading, isError, error, refetch } = useDetailQuery<Session[]>(
    ['sessions'],
    '/v1/auth/sessions',
  );

  const isNotFound = isError && (error as ApiError)?.status === 404;

  return {
    sessions: (response as any)?.data ?? [],
    isLoading,
    isError: isError && !isNotFound,
    isNotFound,
    refetch,
  };
}
