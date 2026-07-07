import { useQuery } from '@tanstack/react-query';
import { UserRole, type IntegrationStatus } from '@properfy/shared';

import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';

/**
 * Lightweight integration status feed for the dashboard warning banners.
 * The endpoint is AM-only, so the query is disabled for every other role
 * (only an AM can fix a missing integration anyway).
 */
export const INTEGRATIONS_STATUS_QUERY_KEY = ['integrations-status'] as const;

export function useIntegrationsStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: INTEGRATIONS_STATUS_QUERY_KEY,
    enabled: user?.role === UserRole.AM,
    queryFn: async (): Promise<IntegrationStatus[]> => {
      const { data, error } = await api.GET('/v1/integrations/status');
      if (error || !data) throw new Error('Failed to load integration status');
      return data.data.integrations as IntegrationStatus[];
    },
  });
}
