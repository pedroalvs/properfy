import { useState, useEffect, useCallback } from 'react';
import type { ServiceGroupDetail } from '../types';
import { MOCK_SERVICE_GROUPS } from '../mocks/service-groups';

export interface UseServiceGroupDetailReturn {
  serviceGroup: ServiceGroupDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useServiceGroupDetail(id: string | null): UseServiceGroupDetailReturn {
  const [serviceGroup, setServiceGroup] = useState<ServiceGroupDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadCount, setLoadCount] = useState(0);

  const refetch = useCallback(() => {
    setLoadCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!id) {
      setServiceGroup(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => {
      const found = MOCK_SERVICE_GROUPS.find((sg) => sg.id === id) ?? null;
      setServiceGroup(found);
      setIsLoading(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [id, loadCount]);

  return { serviceGroup, isLoading, isError: false, refetch };
}
