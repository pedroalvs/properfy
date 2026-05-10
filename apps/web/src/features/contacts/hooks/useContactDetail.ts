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

  return {
    contact: response?.data ?? null,
    isLoading,
    isError,
    refetch,
  };
}
