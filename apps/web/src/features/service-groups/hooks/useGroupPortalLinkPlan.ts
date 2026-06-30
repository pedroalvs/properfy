import { useDetailQuery } from '@/hooks/useApiQuery';
import type { GetGroupPortalLinkPlanResponse } from '@properfy/shared';

export interface UseGroupPortalLinkPlanReturn {
  plan: GetGroupPortalLinkPlanResponse | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Read-only preview powering the "Send portal link" confirm dialog. Fetched
 * lazily (only while the dialog is open) so opening the group page does not
 * trigger the extra round-trip.
 */
export function useGroupPortalLinkPlan(
  groupId: string | null,
  enabled: boolean,
): UseGroupPortalLinkPlanReturn {
  const { data, isLoading, isError } = useDetailQuery<GetGroupPortalLinkPlanResponse>(
    ['service-groups', groupId, 'portal-link-plan'],
    `/v1/service-groups/${groupId}/portal-link-plan`,
    { enabled: !!groupId && enabled },
  );

  return {
    plan: data?.data ?? null,
    isLoading,
    isError,
  };
}
