import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import type { ConsentRecord } from '../hooks/useConsentLookup';

interface ConsentOverrideModalProps {
  consent: ConsentRecord;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Feature 018 US4: operator override modal. Mandatory reason. On success,
 * calls onSuccess (the parent refetches). Built on the shared Dialog primitive,
 * so labelling, focus trap and Escape handling come from the design system
 * rather than a hand-rolled `fixed inset-0` overlay.
 */
export function ConsentOverrideModal({ consent, onClose, onSuccess }: ConsentOverrideModalProps) {
  const [reason, setReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const mutation = useMutation<void, ApiError, string>({
    mutationFn: async (overrideReason) => {
      const { error } = await api.POST(
        '/v1/notifications/consents/{consentId}/override' as any,
        {
          params: { path: { consentId: consent.id } as any },
          body: { reason: overrideReason } as any,
        },
      );
      if (error) {
        const status = (error as { status?: number }).status ?? 500;
        const message = (error as { error?: { message?: string } }).error?.message ?? 'Override failed';
        throw new ApiError(status, message);
      }
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (err) => {
      setErrorMsg(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!reason.trim()) {
      setErrorMsg('Reason is required');
      return;
    }
    mutation.mutate(reason.trim());
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Override Opt-Out"
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
            disabled={!reason.trim()}
          >
            Confirm Override
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-text-secondary">
        You are re-subscribing <strong>{consent.recipient}</strong> on{' '}
        <strong>{consent.channel}</strong> ({consent.notificationClass}) on their behalf. This
        action is audited.
      </p>

      <form ref={formRef} onSubmit={handleSubmit}>
        <label htmlFor="consent-override-reason" className="mb-2 block text-sm font-medium">
          Reason <span className="text-error">*</span>
        </label>
        <textarea
          id="consent-override-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={1000}
          className="w-full rounded border border-border-subtle p-2 text-sm focus:border-primary focus:outline-none"
          placeholder="Contact called in to confirm they want to receive notifications"
          required
        />
        {errorMsg && (
          <InfoBanner variant="error" className="mt-3">
            {errorMsg}
          </InfoBanner>
        )}
      </form>
    </Dialog>
  );
}
