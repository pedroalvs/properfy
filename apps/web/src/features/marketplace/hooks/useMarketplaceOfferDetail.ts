import { useDetailQuery } from '@/hooks/useApiQuery';
import type { MarketplaceOfferDetail } from '../types';

export interface UseMarketplaceOfferDetailReturn {
  detail: MarketplaceOfferDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Fetches a single marketplace offer's detail (`GET /v1/marketplace/offers/:groupId`),
 * including the per-appointment agency breakdown. Disabled until a group is selected.
 */
export function useMarketplaceOfferDetail(groupId: string | null): UseMarketplaceOfferDetailReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<MarketplaceOfferDetail>(
    ['marketplace-offers', 'detail', groupId],
    `/v1/marketplace/offers/${groupId}`,
    { enabled: !!groupId },
  );

  return {
    detail: response?.data ?? null,
    isLoading,
    isError,
    refetch,
  };
}
