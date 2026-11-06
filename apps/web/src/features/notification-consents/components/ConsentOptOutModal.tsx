import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';
import type { ApiError } from '@/lib/api-error';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { AgencySelect } from '@/features/apps/components/AgencySelect';

interface ConsentOptOutModalProps {
  /** Pre-fills the recipient from the current lookup search. */
  initialRecipient?: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Channel = 'EMAIL' | 'SMS';

interface OptOutBody {
  tenantId: string;
  recipient: string;
  channel: Channel;
  reason: string;
}

/**
 * F06 L-F06-03: AM/OP records a manual opt-out so an OPERATIONAL tenant message
 * (including the arrival-time notices, which have no "reply STOP" footer) stops
 * reaching a recipient. Mirrors ConsentOverrideModal on the shared Dialog.
 */
export function ConsentOptOutModal({ initialRecipient, onClose, onSuccess }: ConsentOptOutModalProps) {
  const [tenantId, setTenantId] = useState('');
  const [recipient, setRecipient] = useState(initialRecipient ?? '');
  const [channel, setChannel] = useState<Channel>('SMS');
  const [reason, setReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const mutation = useMutation<void, ApiError, OptOutBody>({
    mutationFn: async (body) => {
      // The route validates the body manually (Zod safeParse), so the OpenAPI spec
      // registers no typed request body — cast like ConsentOverrideModal does.
      const { error, response } = await api.POST('/v1/notifications/consents/opt-out', {
        body: body as never,
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
    },
    onSuccess,
    onError: (err) => setErrorMsg(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!tenantId) {
      setErrorMsg('Agency is required');
      return;
    }
    if (!recipient.trim()) {
      setErrorMsg('Recipient is required');
      return;
    }
    if (!reason.trim()) {
      setErrorMsg('Reason is required');
      return;
    }
    mutation.mutate({ tenantId, recipient: recipient.trim(), channel, reason: reason.trim() });
  };

  const canSubmit = !!tenantId && !!recipient.trim() && !!reason.trim();

  return (
    <Dialog
      open
      onClose={onClose}
      title="Record opt-out"
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={() => formRef.current?.requestSubmit()}
            loading={mutation.isPending}
            disabled={!canSubmit}
          >
            Record opt-out
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-text-secondary">
        Use this when a tenant asks to stop receiving these messages. You can undo it with Override.
      </p>

      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          {/* Not a <label>: AgencySelect is a custom combobox (its own aria-label="Agency"),
              so a <label htmlFor> cannot associate with a native control. */}
          <span className="mb-1 block text-sm font-medium">
            Agency <span className="text-error">*</span>
          </span>
          <AgencySelect value={tenantId} onChange={setTenantId} aria-label="Agency" />
        </div>

        <div>
          <label htmlFor="consent-optout-recipient" className="mb-1 block text-sm font-medium">
            Recipient (email or mobile) <span className="text-error">*</span>
          </label>
          <input
            id="consent-optout-recipient"
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="w-full rounded border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:outline-none"
            required
          />
        </div>

        <div>
          <label htmlFor="consent-optout-channel" className="mb-1 block text-sm font-medium">
            Channel
          </label>
          <select
            id="consent-optout-channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            className="w-full rounded border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="SMS">SMS</option>
            <option value="EMAIL">Email</option>
          </select>
        </div>

        <div>
          <label htmlFor="consent-optout-reason" className="mb-1 block text-sm font-medium">
            Reason <span className="text-error">*</span>
          </label>
          <textarea
            id="consent-optout-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full rounded border border-border-subtle p-2 text-sm focus:border-primary focus:outline-none"
            placeholder="Tenant asked by phone to stop messages"
            required
          />
        </div>

        {errorMsg && (
          <InfoBanner variant="error" className="mt-1">
            {errorMsg}
          </InfoBanner>
        )}
      </form>
    </Dialog>
  );
}
