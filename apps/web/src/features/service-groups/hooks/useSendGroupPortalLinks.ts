import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { SendGroupPortalLinksResponse, SendGroupPortalLinksResultItem } from '@properfy/shared';

export interface UseSendGroupPortalLinksReturn {
  send: (actorTimezone?: string) => void;
  isSending: boolean;
}

function summarize(results: SendGroupPortalLinksResultItem[]): string {
  const count = (status: SendGroupPortalLinksResultItem['status']) =>
    results.filter((r) => r.status === status).length;

  const sent = count('SENT') + count('DATE_CHANGED_RESENT');
  const skipped = count('ALREADY_CONFIRMED') + count('NOT_SENDABLE') + count('IDEMPOTENT_REPLAY');
  const noContact = count('NO_PRIMARY_CONTACT');
  const failed = count('ERROR');

  const parts = [`${sent} sent`];
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (noContact > 0) parts.push(`${noContact} no primary contact`);
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(' · ');
}

/**
 * Sends the tenant confirmation portal link to every appointment in a group.
 * Aggregates the per-item result envelope into a single snackbar so the
 * operator sees what happened (sent / skipped / no-contact / failed) at a
 * glance. Invalidates the group + appointments queries so any surfaced
 * confirmation state refreshes.
 */
export function useSendGroupPortalLinks(
  serviceGroupId: string | null,
  onSuccess?: () => void,
): UseSendGroupPortalLinksReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation<SendGroupPortalLinksResponse>(
    `/v1/service-groups/${serviceGroupId}/portal-links`,
    [['service-groups'], ['service-groups', serviceGroupId], ['appointments']],
  );

  const send = (actorTimezone?: string) => {
    if (!serviceGroupId) return;
    mutation.mutate(
      actorTimezone ? { actorTimezone } : {},
      {
        onSuccess: (resp) => {
          showSuccess(summarize(resp.data.results));
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to send portal links');
        },
      },
    );
  };

  return {
    send,
    isSending: mutation.isPending,
  };
}
