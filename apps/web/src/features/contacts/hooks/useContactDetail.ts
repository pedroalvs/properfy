import { useMemo } from 'react';
import { useDetailQuery } from '@/hooks/useApiQuery';
import type { ContactDetail } from '../types';

export interface UseContactDetailReturn {
  contact: ContactDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useContactDetail(contactId: string | null): UseContactDetailReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<ContactDetail>(
    ['contacts', contactId],
    `/v1/contacts/${contactId}`,
    { enabled: !!contactId },
  );

  // PR #961 bug class: ContactFormDrawer's populate effect depends on this reference —
  // keep any future payload transforms INSIDE this memo so it stays stable per fetch.
  const contact = useMemo(() => response?.data ?? null, [response?.data]);

  return {
    contact,
    isLoading,
    isError,
    refetch,
  };
}
