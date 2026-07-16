import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PLATFORM_TIMEZONE, zonedWallTimeToUtc } from '@properfy/shared';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import {
  formInput,
  formInputContainer,
  formInputContainerError,
} from '@/components/forms/form-styles';
import { useSnackbar } from '@/hooks/useSnackbar';
import { api } from '@/services/api';

interface MarkInvoicePaidModalProps {
  open: boolean;
  onClose: () => void;
  invoiceIds: string[];
  onSuccess: () => void;
}

interface FormState {
  paidAt: string;
  paymentReference: string;
}

interface FormErrors {
  paidAt?: string;
  paymentReference?: string;
}

interface BatchSkipped {
  id: string;
  reason: string;
}

interface BatchResponseData {
  processed: Array<{ id: string; status: string }>;
  skipped: BatchSkipped[];
}

/**
 * Produce a `YYYY-MM-DDTHH:mm` string of the CURRENT SYDNEY WALL TIME for
 * `<input type="datetime-local">`. The platform is Sydney-only: the value the
 * operator sees and edits is Sydney wall time, and on submit it is converted
 * back to UTC via `zonedWallTimeToUtc` — so the round-trip is offset-safe
 * regardless of the operator's location. (Supersedes Bug B-7, which was about
 * the earlier UTC-vs-local mismatch.)
 */
function defaultPaidAt(): string {
  // en-CA formats as YYYY-MM-DD; combined with hour12:false this yields the
  // exact `YYYY-MM-DDTHH:mm` shape datetime-local expects.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PLATFORM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  // Intl may render midnight as "24:00" with hour12: false — normalize to "00".
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

function friendlyError(status: number | undefined, code: string | undefined): string {
  if (status === 403) return 'You do not have permission to mark invoices as paid.';
  if (status === 409 || code === 'INVOICE_ALREADY_PAID') return 'This invoice is already marked as paid.';
  if (code === 'INVOICE_NOT_CLOSED') return 'Only CLOSED invoices can be marked as paid.';
  if (code === 'INVOICE_PAYMENT_DATE_INVALID')
    return 'The payment date is invalid. It cannot be in the future or before the invoice was generated.';
  if (status === 400) return 'Invalid payment information. Please review the form and try again.';
  return 'Failed to mark invoice as paid. Please try again.';
}

export function MarkInvoicePaidModal({
  open,
  onClose,
  invoiceIds,
  onSuccess,
}: MarkInvoicePaidModalProps) {
  const [form, setForm] = useState<FormState>({
    paidAt: defaultPaidAt(),
    paymentReference: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showSuccess, showError } = useSnackbar();
  const queryClient = useQueryClient();

  const isBatch = invoiceIds.length > 1;
  const title = isBatch ? `Mark ${invoiceIds.length} Invoices as Paid` : 'Mark Invoice as Paid';

  useEffect(() => {
    if (open) {
      setForm({ paidAt: defaultPaidAt(), paymentReference: '' });
      setErrors({});
    }
  }, [open]);

  const updateField = useCallback(<K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (prev[field]) {
        const next = { ...prev };
        delete next[field];
        return next;
      }
      return prev;
    });
  }, []);

  const validate = useCallback((): boolean => {
    const next: FormErrors = {};
    if (!form.paidAt.trim()) {
      next.paidAt = 'Required field';
    }
    if (form.paymentReference && form.paymentReference.length > 255) {
      next.paymentReference = 'Maximum 255 characters';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    if (invoiceIds.length === 0) return;

    setIsSubmitting(true);
    try {
      // The datetime-local value is Sydney wall time — convert to UTC explicitly.
      const [paidDate, paidTime] = form.paidAt.split('T') as [string, string];
      const paidAtIso = zonedWallTimeToUtc(paidDate, paidTime, PLATFORM_TIMEZONE).toISOString();
      const reference = form.paymentReference.trim();
      const body: { paidAt: string; paymentReference?: string } = { paidAt: paidAtIso };
      if (reference) body.paymentReference = reference;

      if (isBatch) {
        const { data, error } = await api.POST(
          '/v1/billing/invoices/batch-mark-paid' as never,
          {
            body: { invoiceIds, ...body } as never,
            headers: { 'Idempotency-Key': crypto.randomUUID() },
          } as never,
        );
        if (error) {
          const err = error as { status?: number; error?: { code?: string } };
          showError(friendlyError(err.status, err.error?.code));
          return;
        }
        const result = (data as { data?: BatchResponseData })?.data;
        const processed = result?.processed?.length ?? 0;
        const skipped = result?.skipped?.length ?? 0;
        const message =
          skipped > 0
            ? `${processed} invoice${processed === 1 ? '' : 's'} marked as paid, ${skipped} skipped`
            : `${processed} invoice${processed === 1 ? '' : 's'} marked as paid`;
        showSuccess(message);
      } else {
        const invoiceId = invoiceIds[0];
        const { error } = await api.POST(
          '/v1/billing/invoices/{invoiceId}/mark-paid' as never,
          {
            params: { path: { invoiceId } },
            body: body as never,
            headers: { 'Idempotency-Key': crypto.randomUUID() },
          } as never,
        );
        if (error) {
          const err = error as { status?: number; error?: { code?: string } };
          showError(friendlyError(err.status, err.error?.code));
          return;
        }
        showSuccess('Invoice marked as paid');
      }

      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing', 'reconciliation-summary'] });
      onSuccess();
      onClose();
    } catch {
      showError('Failed to mark invoice as paid. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    form,
    invoiceIds,
    isBatch,
    onClose,
    onSuccess,
    queryClient,
    showError,
    showSuccess,
    validate,
  ]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    onClose();
  }, [isSubmitting, onClose]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={title}
      actions={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" loading={isSubmitting} onClick={handleSubmit}>
            Confirm Payment
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {isBatch && (
          <p className="text-sm text-text-secondary">
            You are about to mark {invoiceIds.length} invoices as paid. Invoices that are already
            paid or not yet closed will be skipped.
          </p>
        )}
        <FormField label="Payment Date" required error={errors.paidAt}>
          <div className={errors.paidAt ? formInputContainerError : formInputContainer}>
            <input
              type="datetime-local"
              className={formInput}
              value={form.paidAt}
              onChange={(e) => updateField('paidAt', e.target.value)}
              onClick={(e) => e.currentTarget.showPicker?.()}
              aria-label="Payment Date"
            />
          </div>
        </FormField>
        <FormField
          label="Payment Reference"
          error={errors.paymentReference}
          hint="Optional. Bank transaction ID, receipt number, etc."
        >
          <TextInput
            value={form.paymentReference}
            onChange={(v) => updateField('paymentReference', v)}
            placeholder="e.g. TXN-2026-0001"
            maxLength={255}
            aria-label="Payment Reference"
          />
        </FormField>
      </div>
    </Dialog>
  );
}
