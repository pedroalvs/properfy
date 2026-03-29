import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination } from '@/components/data/DataTable';
import type { MarketplaceOffer } from '../types';

export interface UseMarketplaceOffersReturn {
  data: MarketplaceOffer[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  pagination: DataTablePagination;
}

export function useMarketplaceOffers(): UseMarketplaceOffersReturn {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const params: ListParams = {
    page,
    pageSize,
  };

  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<MarketplaceOffer>(
    ['marketplace-offers'],
    '/v1/marketplace/offers',
    params,
  );

  const pagination: DataTablePagination = {
    page,
    pageSize,
    total: response?.pagination.total ?? 0,
    onChange: (newPage, newPageSize) => {
      setPage(newPage);
      setPageSize(newPageSize);
    },
  };

  return {
    data: response?.data ?? [],
    isLoading,
    isError,
    errorMessage: null,
    refetch,
    pagination,
  };
}
