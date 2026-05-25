import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/hooks/useApiQuery';
import type { MarketplaceOfferDetail } from '../types';

export function useMarketplaceOfferDetail(groupId: string | null) {
  return useQuery<{ data: MarketplaceOfferDetail }, Error, MarketplaceOfferDetail>({
    queryKey: ['marketplace', 'offer-detail', groupId],
    queryFn: () => apiGet<{ data: MarketplaceOfferDetail }>(`/v1/marketplace/offers/${groupId}`),
    enabled: groupId !== null,
    select: (response) => response.data,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
  });
}
