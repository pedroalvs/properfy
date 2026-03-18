import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_OFFER_FILTERS, type MarketplaceOffer, type OfferFiltersState } from '../types';

export interface UseMarketplaceOffersReturn {
  data: MarketplaceOffer[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: OfferFiltersState;
  setFilters: (filters: OfferFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useMarketplaceOffers(): UseMarketplaceOffersReturn {
  const [filters, setFilters] = useState<OfferFiltersState>(DEFAULT_OFFER_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const params: ListParams = {
    page,
    pageSize,
    sortBy,
    sortOrder,
    search: filters.search || undefined,
    priorityMode: filters.priorityMode || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
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

  const sorting: DataTableSorting = {
    sortBy,
    sortOrder,
    onChange: (newSortBy, newSortOrder) => {
      setSortBy(newSortBy);
      setSortOrder(newSortOrder);
    },
  };

  return {
    data: response?.data ?? [],
    isLoading,
    isError,
    errorMessage: null,
    refetch,
    filters,
    setFilters,
    pagination,
    sorting,
  };
}
