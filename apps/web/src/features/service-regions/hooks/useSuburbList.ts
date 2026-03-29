import { usePaginatedQuery } from '@/hooks/useApiQuery';
import type { Suburb } from '../types';

export interface UseSuburbListReturn {
  suburbs: Suburb[];
  isLoading: boolean;
}

export function useSuburbList(search?: string): UseSuburbListReturn {
  const query = usePaginatedQuery<Suburb>(
    ['suburbs', search],
    '/v1/suburbs',
    {
      pageSize: 100,
      ...(search ? { search } : {}),
    },
  );

  return {
    suburbs: query.data?.data ?? [],
    isLoading: query.isLoading,
  };
}
