import { useState, useEffect, useCallback } from 'react';
import type { PropertyDetail } from '../types';
import { MOCK_PROPERTIES } from '../mocks/properties';

export interface UsePropertyDetailReturn {
  property: PropertyDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function usePropertyDetail(id: string | null): UsePropertyDetailReturn {
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadCount, setLoadCount] = useState(0);

  const refetch = useCallback(() => {
    setLoadCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!id) {
      setProperty(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => {
      const found = MOCK_PROPERTIES.find((p) => p.id === id) ?? null;
      setProperty(found);
      setIsLoading(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [id, loadCount]);

  return { property, isLoading, isError: false, refetch };
}
