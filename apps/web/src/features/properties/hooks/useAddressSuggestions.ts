import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';
import type { ApiError } from '@/lib/api-error';
import type { AddressLookupSuggestion } from '@/lib/address';

interface AddressSuggestionResponse {
  data: AddressLookupSuggestion[];
}

export function useAddressSuggestions(search: string, enabled = true, country?: string) {
  return useQuery<AddressLookupSuggestion[], ApiError>({
    queryKey: ['address-suggestions', search, country ?? null],
    enabled: enabled && search.trim().length >= 3,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/v1/address/suggestions', {
        params: {
          query: {
            q: search.trim(),
            limit: 5,
            ...(country ? { country } : {}),
          },
        },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return ((data as unknown as AddressSuggestionResponse | undefined)?.data ?? []);
    },
  });
}
