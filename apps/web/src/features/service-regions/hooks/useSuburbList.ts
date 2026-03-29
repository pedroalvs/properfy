import { usePaginatedQuery } from '@/hooks/useApiQuery';
import type { Suburb } from '../types';

export interface UseSuburbListReturn {
  suburbs: Suburb[];
  isLoading: boolean;
}

export function useSuburbList(country: string, state: string, city: string): UseSuburbListReturn {
  const enabled = !!country && !!state && !!city;

  const query = usePaginatedQuery<Suburb>(
    ['suburbs', country, state, city],
    '/v1/suburbs',
    {
      pageSize: 200,
      country,
      state,
      city,
    },
    { enabled },
  );

  return {
    suburbs: enabled ? (query.data?.data ?? []) : [],
    isLoading: query.isLoading,
  };
}
