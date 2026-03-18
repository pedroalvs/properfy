import { useState, useCallback } from 'react';
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

  return {
    property: response?.data ?? null,
    isLoading,
    isError,
    isGeocodingTimeout,
    refetch: handleRefetch,
  };
}
