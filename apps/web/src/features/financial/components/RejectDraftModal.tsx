import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { Textarea } from '@/components/forms/Textarea';
import { useSnackbar } from '@/hooks/useSnackbar';
import { api } from '@/services/api';
import { getErrorMessage, toApiError, type ApiError } from '@/lib/api-error';

interface RejectDraftModalProps {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  onSuccess: () => void;
}

function friendlyError(err: ApiError): string {
  const { status, code } = err;
  if (status === 403) return 'You do not have permission to reject draft invoices.';
  if (code === 'INVOICE_NOT_PENDING_REVIEW') return 'This invoice is not in pending review status.';
  if (status === 404) return 'Invoice not found.';
  return getErrorMessage(err, 'Failed to reject draft invoice. Please try again.');
}

export function RejectDraftModal({
  open,
  onClose,
  invoiceId,
  onSuccess,
}: RejectDraftModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showSuccess, showError } = useSnackbar();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('Required field');
      return;
    }
    if (trimmed.length < 10) {
      setError('Minimum 10 characters');
      return;
    }
    if (trimmed.length > 1000) {
      setError('Maximum 1000 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: apiErr, response } = await api.POST(
        '/v1/billing/invoices/{invoiceId}/reject-draft' as never,
        {
          params: { path: { invoiceId } },
          body: { reason: trimmed } as never,
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        } as never,
      );
      if (apiErr) {
        showError(friendlyError(toApiError(apiErr, (response as Response | undefined)?.status)));
        return;
      }
      showSuccess('Draft invoice rejected');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      onSuccess();
      onClose();
    } catch (err) {
      showError(friendlyError(toApiError(err)));
    } finally {
      setIsSubmitting(false);
    }
  }, [reason, invoiceId, onClose, onSuccess, queryClient, showError, showSuccess]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    onClose();
  }, [isSubmitting, onClose]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Reject Draft Invoice"
      actions={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" loading={isSubmitting} onClick={handleSubmit}>
            Confirm Rejection
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded border border-error/40 bg-error/10 px-3 py-2 text-sm text-text-primary">
          This will reject the draft invoice and return it to the inspector for revision. A reason is
          required for the audit log.
        </div>
        <FormField label="Reason" required error={error ?? undefined}>
          <Textarea
            value={reason}
            onChange={(v) => {
              setReason(v);
              if (error) setError(null);
            }}
            rows={4}
            maxLength={1000}
            placeholder="Describe why this draft invoice is being rejected (min 10 characters)"
            aria-label="Reason"
          />
        </FormField>
      </div>
    </Dialog>
  );
}
