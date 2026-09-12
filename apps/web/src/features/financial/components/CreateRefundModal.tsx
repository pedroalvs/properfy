import { useState, useCallback, useEffect } from 'react';
import { createRefundSchema } from '@properfy/shared';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { Textarea } from '@/components/forms/Textarea';
import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { useSnackbar } from '@/hooks/useSnackbar';
import { getErrorMessage } from '@/lib/api-error';
import { formatInstantDate } from '@/lib/format-date';
import { useCreateRefund } from '../hooks/useCreateRefund';
import { FinancialEntryTypeChip } from './FinancialEntryTypeChip';
import { FinancialStatusChip } from './FinancialStatusChip';
import type { FinancialEntry } from '../types';

interface CreateRefundModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** The financial entry (a TENANT_DEBIT) the refund is issued against. */
  entry: FinancialEntry | null;
}

interface RefundFormData {
  description: string;
  reason: string;
}

type RefundFormErrors = Partial<Record<keyof RefundFormData, string>>;

const EMPTY_FORM: RefundFormData = {
  description: '',
  reason: '',
};

function formatCurrency(amount: number, currency: string): string {
  return amount.toLocaleString('en-AU', { style: 'currency', currency });
}

function validate(data: RefundFormData): RefundFormErrors {
  const errors: RefundFormErrors = {};

  const schemaPayload = {
    description: data.description.trim() || undefined,
    reason: data.reason.trim() || undefined,
  };

  const result = createRefundSchema.safeParse(schemaPayload);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      if (path === 'description' && !errors.description) {
        errors.description = issue.message;
      }
      if (path === 'reason' && !errors.reason) {
        errors.reason = issue.message;
      }
    }
  }

  return errors;
}

export function CreateRefundModal({ open, onClose, onCreated, entry }: CreateRefundModalProps) {
  const [form, setForm] = useState<RefundFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<RefundFormErrors>({});
  const { mutateAsync, isPending } = useCreateRefund();
  const { showSuccess, showError } = useSnackbar();

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setErrors({});
    }
  }, [open]);

  const updateField = useCallback(<K extends keyof RefundFormData>(field: K, value: RefundFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (prev[field]) { const next = { ...prev }; delete next[field]; return next; }
      return prev;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!entry) return;
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      await mutateAsync({
        entryId: entry.id,
        description: form.description,
        reason: form.reason,
      });
      showSuccess('Refund created successfully');
      setForm(EMPTY_FORM);
      setErrors({});
      onCreated();
    } catch (err) {
      showError(getErrorMessage(err, 'Failed to create refund'));
    }
  }, [entry, form, mutateAsync, showSuccess, showError, onCreated]);

  const handleClose = useCallback(() => {
    setForm(EMPTY_FORM);
    setErrors({});
    onClose();
  }, [onClose]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Create Refund"
      actions={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" loading={isPending} onClick={handleSubmit} disabled={!entry}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {entry && (
          <FormSection title="Entry">
            <DetailRow label="Type" value={<FinancialEntryTypeChip entryType={entry.entryType} />} />
            <DetailRow label="Amount" value={formatCurrency(entry.amount, entry.currency)} />
            <DetailRow label="Date" value={formatInstantDate(entry.effectiveAt)} />
            <DetailRow label="Status" value={<FinancialStatusChip status={entry.status} />} />
          </FormSection>
        )}
        <FormField label="Description" required error={errors.description}>
          <Textarea
            value={form.description}
            onChange={(v) => updateField('description', v)}
            rows={2}
            aria-label="Description"
          />
        </FormField>
        <FormField label="Reason" required error={errors.reason}>
          <Textarea
            value={form.reason}
            onChange={(v) => updateField('reason', v)}
            rows={3}
            placeholder="Describe the reason for this refund"
            aria-label="Reason"
          />
        </FormField>
      </div>
    </Dialog>
  );
}
