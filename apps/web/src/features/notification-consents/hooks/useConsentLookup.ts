import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
import type { NotificationChannel, NotificationClass, ConsentChangeSource } from '@properfy/shared';

export interface ConsentRecord {
  id: string;
  recipient: string;
  channel: NotificationChannel;
  tenantId: string;
  notificationClass: NotificationClass;
  optedOut: boolean;
  optedOutAt: string | null;
  changeSource: ConsentChangeSource | null;
  changedAt: string | null;
  changedByUserId: string | null;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentLookupResult {
  recipient: string;
  entries: ConsentRecord[];
  skippedCount: number;
}

export interface UseConsentLookupParams {
  recipient: string | null;
  tenantId?: string;
  channel?: NotificationChannel;
}

/**
 * Feature 018 US3: operator consent lookup hook.
 *
 * Disabled until `recipient` is non-null so the page doesn't fire a query
 * on every keystroke before the user clicks Search.
 */
export function useConsentLookup({ recipient, tenantId, channel }: UseConsentLookupParams) {
  return useQuery<ConsentLookupResult, ApiError>({
    queryKey: ['notification-consents', recipient, tenantId, channel],
    enabled: !!recipient,
    queryFn: async () => {
      const query: Record<string, string> = { recipient: recipient! };
      if (tenantId) query['tenantId'] = tenantId;
      if (channel) query['channel'] = channel;
      const { data, error } = await api.GET('/v1/notifications/consents' as any, {
        params: { query: query as any },
      });
      if (error) {
        const status = (error as { status?: number }).status ?? 500;
        const message = (error as { error?: { message?: string } }).error?.message ?? 'Failed to load consents';
        throw new ApiError(status, message);
      }
      const body = data as { data: ConsentLookupResult };
      return body.data;
    },
  });
}
