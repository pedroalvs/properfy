import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { Textarea } from '@/components/forms/Textarea';
import { useSnackbar } from '@/hooks/useSnackbar';
import { api } from '@/services/api';
import { getErrorMessage, toApiError, type ApiError } from '@/lib/api-error';

interface ReversePaymentModalProps {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  onSuccess: () => void;
}

function friendlyError(err: ApiError): string {
  const { status, code } = err;
  if (status === 403) return 'You do not have permission to reverse invoice payments.';
  if (code === 'INVOICE_NOT_PAID') return 'This invoice is not currently marked as paid.';
  if (status === 404) return 'Invoice not found.';
  return getErrorMessage(err, 'Failed to reverse payment. Please try again.');
}

export function ReversePaymentModal({
  open,
  onClose,
  invoiceId,
  onSuccess,
}: ReversePaymentModalProps) {
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
    if (trimmed.length > 1000) {
      setError('Maximum 1000 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: apiErr, response } = await api.POST(
        '/v1/billing/invoices/{invoiceId}/reverse-payment' as never,
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
      showSuccess('Invoice payment reversed');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing', 'reconciliation-summary'] });
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
      title="Reverse Payment"
      actions={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" loading={isSubmitting} onClick={handleSubmit}>
            Confirm Reversal
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-text-primary">
          This will return the invoice to CLOSED status and clear all payment fields. A reason is
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
            placeholder="Describe why this payment is being reversed"
            aria-label="Reason"
          />
        </FormField>
      </div>
    </Dialog>
  );
}
