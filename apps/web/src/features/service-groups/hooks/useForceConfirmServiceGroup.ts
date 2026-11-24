import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { ForceConfirmGroupResponse } from '@properfy/shared';

export interface UseForceConfirmServiceGroupReturn {
  forceConfirm: (reason?: string) => void;
  isForcing: boolean;
}

/**
 * Bulk force-confirm every unconfirmed member of a group (the terminal write of
 * the "confirm on the tenants' behalf & move" branch of the date-change flow).
 * Invalidates the same keys as the reschedule so the detail + appointment lists
 * reflect the new CONFIRMED state.
 */
export function useForceConfirmServiceGroup(
  serviceGroupId: string | null,
  onSuccess?: () => void,
): UseForceConfirmServiceGroupReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation<ForceConfirmGroupResponse>(
    `/v1/service-groups/${serviceGroupId}/force-confirmation`,
    [['service-groups'], ['service-groups', serviceGroupId], ['appointments']],
  );

  const forceConfirm = (reason?: string) => {
    if (!serviceGroupId) return;
    mutation.mutate(reason ? { reason } : {}, {
      onSuccess: (resp) => {
        const n = resp.data.confirmedCount;
        showSuccess(
          n > 0
            ? `Confirmed ${n} appointment(s) on the tenants' behalf`
            : 'No appointments needed confirming',
        );
        onSuccess?.();
      },
      onError: (err) => {
        showError(err.message || 'Failed to confirm the group');
      },
    });
  };

  return { forceConfirm, isForcing: mutation.isPending };
}
