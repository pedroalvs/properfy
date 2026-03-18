import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/hooks/useApiQuery';

interface OffersResponse {
  offers: import('../types').MarketplaceOffer[];
  totalCount: number;
}

export function useMarketplaceOffers() {
  return useQuery<OffersResponse>({
    queryKey: ['marketplace', 'offers'],
    queryFn: () => apiGet<OffersResponse>('/v1/marketplace/offers'),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
