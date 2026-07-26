import { useState, useCallback, useMemo } from 'react';
import { GeocodingStatus } from '@properfy/shared';
import { useDetailQuery } from '@/hooks/useApiQuery';
import type { PropertyDetail } from '../types';

const GEOCODING_MAX_POLLS = 30;

export interface UsePropertyDetailReturn {
  property: PropertyDetail | null;
  isLoading: boolean;
  isError: boolean;
  isGeocodingTimeout: boolean;
  refetch: () => void;
}

export function usePropertyDetail(id: string | null): UsePropertyDetailReturn {
  const [geocodingPollCount, setGeocodingPollCount] = useState(0);

  const isGeocodingTimeout = geocodingPollCount >= GEOCODING_MAX_POLLS;

  const { data: response, isLoading, isError, refetch } = useDetailQuery<PropertyDetail>(
    ['properties', id],
    `/v1/properties/${id}`,
    {
      enabled: !!id,
      refetchInterval: (query) => {
        const property = query.state.data?.data;
        if (property?.geocodingStatus === GeocodingStatus.PENDING && geocodingPollCount < GEOCODING_MAX_POLLS) {
          setGeocodingPollCount((c) => c + 1);
          return 10_000;
        }
        return false;
      },
    },
  );

  const handleRefetch = useCallback(() => {
    setGeocodingPollCount(0);
    refetch();
  }, [refetch]);

  // PR #961 bug class: PropertyFormDrawer's populate effect depends on this reference —
  // keep any future payload transforms INSIDE this memo so it stays stable per fetch.
  const property = useMemo(() => response?.data ?? null, [response?.data]);

  return {
    property,
    isLoading,
    isError,
    isGeocodingTimeout,
    refetch: handleRefetch,
  };
}
