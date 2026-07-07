import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  IntegrationDetail,
  IntegrationProvider,
  IntegrationTestResult,
} from '@properfy/shared';

import { api } from '@/services/api';

export const INTEGRATIONS_QUERY_KEY = ['integrations'] as const;

export function useIntegrations() {
  return useQuery({
    queryKey: INTEGRATIONS_QUERY_KEY,
    queryFn: async (): Promise<IntegrationDetail[]> => {
      const { data, error } = await api.GET('/v1/integrations');
      if (error || !data) throw new Error('Failed to load integrations');
      return data.data.integrations as IntegrationDetail[];
    },
  });
}

export function useUpsertIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      provider: IntegrationProvider;
      config: Record<string, string>;
      enabled?: boolean;
    }): Promise<IntegrationDetail> => {
      const { data, error } = await api.PUT('/v1/integrations/{provider}', {
        params: { path: { provider: input.provider } },
        body: { config: input.config, enabled: input.enabled },
      });
      if (error || !data) throw new Error('Failed to save the integration');
      return data.data as IntegrationDetail;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INTEGRATIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['integrations-status'] });
    },
  });
}

export function useDeleteIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (provider: IntegrationProvider): Promise<void> => {
      const { error } = await api.DELETE('/v1/integrations/{provider}', {
        params: { path: { provider } },
      });
      if (error) throw new Error('Failed to remove the integration');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INTEGRATIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['integrations-status'] });
    },
  });
}

export function useTestIntegration() {
  return useMutation({
    mutationFn: async (provider: IntegrationProvider): Promise<IntegrationTestResult> => {
      const { data, error } = await api.POST('/v1/integrations/{provider}/test', {
        params: { path: { provider } },
      });
      if (error || !data) throw new Error('Connection test failed');
      return data.data as IntegrationTestResult;
    },
  });
}
