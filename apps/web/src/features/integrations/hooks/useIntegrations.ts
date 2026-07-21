import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  IntegrationDetail,
  IntegrationProvider,
  IntegrationTestResult,
} from '@properfy/shared';

import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';
import { INTEGRATIONS_STATUS_QUERY_KEY } from './useIntegrationsStatus';

export const INTEGRATIONS_QUERY_KEY = ['integrations'] as const;

export function useIntegrations() {
  return useQuery({
    queryKey: INTEGRATIONS_QUERY_KEY,
    queryFn: async (): Promise<IntegrationDetail[]> => {
      const { data, error, response } = await api.GET('/v1/integrations');
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      if (!data) throw new Error('Failed to load integrations');
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
      void queryClient.invalidateQueries({ queryKey: INTEGRATIONS_STATUS_QUERY_KEY });
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
      void queryClient.invalidateQueries({ queryKey: INTEGRATIONS_STATUS_QUERY_KEY });
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
