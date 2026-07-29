import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseReassignInspectorReturn {
  reassign: (inspectorId: string, reason: string) => void;
  isReassigning: boolean;
}

/**
 * Replaces the inspector on a group that already has one.
 *
 * Distinct from `useAssignInspector`: `/assign` answers an already-accepted
 * group with a 409 by design (the marketplace race guard), so replacement has
 * its own endpoint. Also invalidates `['appointments']`, because every member's
 * assigned inspector changes with it.
 */
export function useReassignInspector(
  serviceGroupId: string | null,
  onSuccess?: () => void,
): UseReassignInspectorReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/service-groups/${serviceGroupId}/reassign-inspector`,
    [['service-groups'], ['service-groups', serviceGroupId], ['appointments']],
  );

  const reassign = (inspectorId: string, reason: string) => {
    if (!serviceGroupId) return;
    mutation.mutate(
      { inspectorId, reason },
      {
        onSuccess: () => {
          showSuccess('Inspector changed — both inspectors have been notified');
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to change inspector');
        },
      },
    );
  };

  return { reassign, isReassigning: mutation.isPending };
}
