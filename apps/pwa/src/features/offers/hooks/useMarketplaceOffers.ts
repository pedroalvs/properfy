import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiGet } from '@/hooks/useApiQuery';
import type { MarketplaceOffer } from '../types';

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// Backend max — without explicit params the endpoint defaults to pageSize 20,
// which silently hid every offer beyond the 20 soonest-dated ones.
const PAGE_SIZE = 100;

export function useMarketplaceOffers() {
  const query = useInfiniteQuery<PaginatedResponse<MarketplaceOffer>>({
    queryKey: ['marketplace', 'offers'],
    queryFn: ({ pageParam }) =>
      apiGet<PaginatedResponse<MarketplaceOffer>>('/v1/marketplace/offers', {
        page: String(pageParam),
        pageSize: String(PAGE_SIZE),
      }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const offers = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data],
  );

  return {
    ...query,
    offers,
    total: query.data?.pages[0]?.pagination.total ?? 0,
  };
}
