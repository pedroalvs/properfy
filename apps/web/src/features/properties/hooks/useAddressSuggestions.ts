import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
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
      const { data, error } = await api.GET('/v1/address/suggestions' as any, {
        params: {
          query: {
            q: search.trim(),
            limit: '5',
            ...(country ? { country } : {}),
          } as any,
        },
      });
      if (error) {
        throw new ApiError(
          (error as { status?: number }).status ?? 500,
          (error as { message?: string }).message ?? 'Failed to search addresses',
          (error as { code?: string }).code,
        );
      }
      return ((data as AddressSuggestionResponse | undefined)?.data ?? []);
    },
  });
}
