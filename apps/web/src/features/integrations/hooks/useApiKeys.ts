import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiKeyCreated, ApiKeyCreateInput, ApiKeyResponse } from '@properfy/shared';

import { api } from '@/services/api';

export const API_KEYS_QUERY_KEY = ['api-keys'] as const;

export function useApiKeys() {
  return useQuery({
    queryKey: API_KEYS_QUERY_KEY,
    queryFn: async (): Promise<ApiKeyResponse[]> => {
      const { data, error } = await api.GET('/v1/api-keys');
      if (error || !data) throw new Error('Failed to load API keys');
      return data.data.apiKeys as ApiKeyResponse[];
    },
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApiKeyCreateInput): Promise<ApiKeyCreated> => {
      const { data, error } = await api.POST('/v1/api-keys', { body: input });
      if (error || !data) throw new Error('Failed to create the API key');
      return data.data as ApiKeyCreated;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<ApiKeyResponse> => {
      const { data, error } = await api.POST('/v1/api-keys/{id}/revoke', {
        params: { path: { id } },
      });
      if (error || !data) throw new Error('Failed to revoke the API key');
      return data.data as ApiKeyResponse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
    },
  });
}
