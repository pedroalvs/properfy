import { useMemo } from 'react';
import { useDetailQuery } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';
import type { ContactDetail } from '../types';

export interface UseContactDetailReturn {
  contact: ContactDetail | null;
  isLoading: boolean;
  isError: boolean;
  /**
   * The thrown `ApiError` (carries `.status`) so consumers can distinguish
   * 403 vs 404 vs a transient failure instead of collapsing every failure
   * mode into "no contact". Null while the fetch is healthy.
   */
  error: ApiError | null;
  refetch: () => void;
}

export function useContactDetail(contactId: string | null): UseContactDetailReturn {
  const { data: response, isLoading, isError, error, refetch } = useDetailQuery<ContactDetail>(
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
    error: error ?? null,
    refetch,
  };
}
