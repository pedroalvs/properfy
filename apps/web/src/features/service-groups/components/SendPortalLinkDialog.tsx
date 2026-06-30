import type { ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useGroupPortalLinkPlan } from '../hooks/useGroupPortalLinkPlan';

interface SendPortalLinkDialogProps {
  open: boolean;
  onClose: () => void;
  serviceGroupId: string;
  sending: boolean;
  onConfirm: () => void;
}

/**
 * Confirm dialog for the group "Send portal link" action. Fetches a read-only
 * preview (only while open) and summarizes what will happen — how many links
 * will be sent, how many already-confirmed appointments are skipped — before
 * the operator confirms. Confirm is disabled when nothing would be sent.
 */
export function SendPortalLinkDialog({
  open,
  onClose,
  serviceGroupId,
  sending,
  onConfirm,
}: SendPortalLinkDialogProps) {
  const { plan, isLoading, isError } = useGroupPortalLinkPlan(serviceGroupId, open);

  const summary = plan?.summary;
  const willAct = summary ? summary.willSend + summary.willResendDateChanged : 0;

  let message: ReactNode;
  if (isLoading) {
    message = 'Loading appointments…';
  } else if (isError || !summary) {
    message = 'Could not load the appointments for this group. Please try again.';
  } else {
    message = (
      <div className="space-y-2">
        <p>
          Send the tenant confirmation portal link to the appointments in this group
          {' '}(<strong>{summary.total}</strong> total).
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>{summary.willSend}</strong> will be sent</li>
          {summary.willResendDateChanged > 0 && (
            <li><strong>{summary.willResendDateChanged}</strong> will be re-sent (date changed)</li>
          )}
          <li><strong>{summary.alreadyConfirmed}</strong> already confirmed — skipped</li>
          {summary.notSendable > 0 && (
            <li><strong>{summary.notSendable}</strong> not sendable (draft/done/cancelled/rejected) — skipped</li>
          )}
        </ul>
        {willAct === 0 && (
          <p className="text-text-secondary">No appointments need a portal link right now.</p>
        )}
      </div>
    );
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Send portal link"
      message={message}
      confirmLabel="Send portal link"
      variant="warning"
      loading={sending}
      confirmDisabled={isLoading || isError || willAct === 0}
    />
  );
}
