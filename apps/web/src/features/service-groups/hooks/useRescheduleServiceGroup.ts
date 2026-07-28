import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { ChangeGroupScheduleRequest, ChangeGroupScheduleResponse } from '@properfy/shared';

export interface UseRescheduleServiceGroupReturn {
  reschedule: (input: ChangeGroupScheduleRequest) => void;
  isRescheduling: boolean;
}

function summarize(applied: ChangeGroupScheduleResponse['applied']): string {
  const parts: string[] = [];
  if (applied.dateChanged > 0) parts.push(`${applied.dateChanged} moved`);
  if (applied.slotClamped > 0) parts.push(`${applied.slotClamped} time slot(s) adjusted`);
  if (applied.confirmationsHandled > 0) {
    parts.push(
      applied.confirmationStrategy === 'RESEND'
        ? `${applied.confirmationsHandled} confirmation(s) reset`
        : `${applied.confirmationsHandled} tenant(s) notified`,
    );
  }
  if (applied.failed > 0) parts.push(`${applied.failed} failed`);
  return parts.length > 0 ? parts.join(' · ') : 'Schedule updated — no appointments needed changing';
}

/**
 * Moves a group's date and/or time window, cascading to its members.
 *
 * The modal previews the impact client-side, but the server recomputes against
 * fresh rows — so the snackbar reports the counts the API actually applied
 * rather than the ones that were previewed.
 *
 * Keeps `['service-groups', id]` in the invalidation list on purpose: it
 * prefix-matches the portal-link plan query, which a schedule change
 * necessarily invalidates.
 */
export function useRescheduleServiceGroup(
  serviceGroupId: string | null,
  onSuccess?: () => void,
): UseRescheduleServiceGroupReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation<ChangeGroupScheduleResponse>(
    `/v1/service-groups/${serviceGroupId}/schedule`,
    [['service-groups'], ['service-groups', serviceGroupId], ['appointments']],
  );

  const reschedule = (input: ChangeGroupScheduleRequest) => {
    if (!serviceGroupId) return;
    mutation.mutate(input, {
      onSuccess: (resp) => {
        showSuccess(summarize(resp.data.applied));
        onSuccess?.();
      },
      onError: (err) => {
        showError(err.message || 'Failed to change the group schedule');
      },
    });
  };

  return { reschedule, isRescheduling: mutation.isPending };
}
