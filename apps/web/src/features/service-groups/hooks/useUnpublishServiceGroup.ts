import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseUnpublishServiceGroupReturn {
  unpublish: (reason: string) => void;
  isUnpublishing: boolean;
}

/**
 * Pulls a published group off the marketplace (`PUBLISHED → DRAFT`).
 *
 * `service-groups-map` is invalidated alongside the list keys because the map
 * page reads its group pins from that key — without it the popup keeps
 * offering UNPUBLISH on a group that is already back in draft.
 */
export function useUnpublishServiceGroup(
  serviceGroupId: string | null,
  onSuccess?: () => void,
): UseUnpublishServiceGroupReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/service-groups/${serviceGroupId}/unpublish`,
    [['service-groups'], ['service-groups', serviceGroupId], ['service-groups-map']],
  );

  const unpublish = (reason: string) => {
    if (!serviceGroupId) return;
    mutation.mutate(
      { reason },
      {
        onSuccess: () => {
          showSuccess('Service group unpublished');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to unpublish service group');
        },
      },
    );
  };

  return {
    unpublish,
    isUnpublishing: mutation.isPending,
  };
}
