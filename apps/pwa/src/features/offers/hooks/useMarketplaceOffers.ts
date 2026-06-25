import { useQuery } from '@tanstack/react-query';
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

export function useMarketplaceOffers() {
  return useQuery<PaginatedResponse<MarketplaceOffer>>({
    queryKey: ['marketplace', 'offers'],
    queryFn: () => apiGet<PaginatedResponse<MarketplaceOffer>>('/v1/marketplace/offers'),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
