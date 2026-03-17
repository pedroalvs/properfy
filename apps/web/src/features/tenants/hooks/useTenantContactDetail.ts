import { useState, useEffect, useCallback } from 'react';
import type { TenantContactDetail } from '../types';
import { MOCK_TENANT_CONTACTS } from '../mocks/tenantContacts';

export interface UseTenantContactDetailReturn {
  contact: TenantContactDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useTenantContactDetail(id: string | null): UseTenantContactDetailReturn {
  const [contact, setContact] = useState<TenantContactDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadCount, setLoadCount] = useState(0);

  const refetch = useCallback(() => {
    setLoadCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!id) {
      setContact(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => {
      const found = MOCK_TENANT_CONTACTS.find((c) => c.id === id) ?? null;
      setContact(found);
      setIsLoading(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [id, loadCount]);

  return { contact, isLoading, isError: false, refetch };
}
