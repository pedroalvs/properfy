import { useState, useEffect, useCallback } from 'react';
import type { InspectorDetail } from '../types';
import { MOCK_INSPECTORS } from '../mocks/inspectors';

export interface UseInspectorDetailReturn {
  inspector: InspectorDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useInspectorDetail(id: string | null): UseInspectorDetailReturn {
  const [inspector, setInspector] = useState<InspectorDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadCount, setLoadCount] = useState(0);

  const refetch = useCallback(() => {
    setLoadCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!id) {
      setInspector(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => {
      const found = MOCK_INSPECTORS.find((i) => i.id === id) ?? null;
      setInspector(found);
      setIsLoading(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [id, loadCount]);

  return { inspector, isLoading, isError: false, refetch };
}
