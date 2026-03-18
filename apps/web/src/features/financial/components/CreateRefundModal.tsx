import { useState, useCallback } from 'react';
import { createRefundSchema } from '@properfy/shared';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { NumberInput } from '@/components/forms/NumberInput';
import { DateInput } from '@/components/forms/DateInput';
import { Textarea } from '@/components/forms/Textarea';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useCreateRefund } from '../hooks/useCreateRefund';

interface CreateRefundModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface RefundFormData {
  appointmentId: string;
  amount: string;
  reason: string;
  effectiveAt: string;
}

type RefundFormErrors = Partial<Record<keyof RefundFormData, string>>;

const EMPTY_FORM: RefundFormData = {
  appointmentId: '',
  amount: '',
  reason: '',
  effectiveAt: '',
};

function validate(data: RefundFormData): RefundFormErrors {
  const errors: RefundFormErrors = {};
  if (!data.appointmentId.trim()) errors.appointmentId = 'Required field';
  if (!data.amount.trim()) errors.amount = 'Required field';
  if (!data.effectiveAt.trim()) errors.effectiveAt = 'Required field';

  // Validate description/reason fields using the shared Zod schema
  const schemaPayload = {
    description: data.reason.trim() || undefined,
    reason: data.reason.trim() || undefined,
  };

  const result = createRefundSchema.safeParse(schemaPayload);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      if ((path === 'description' || path === 'reason') && !errors.reason) {
        errors.reason = issue.message;
      }
    }
  }

  return errors;
}

export function CreateRefundModal({ open, onClose, onCreated }: CreateRefundModalProps) {
  const [form, setForm] = useState<RefundFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<RefundFormErrors>({});
  const { mutateAsync, isPending } = useCreateRefund();
  const { showSuccess, showError } = useSnackbar();

  const updateField = useCallback(<K extends keyof RefundFormData>(field: K, value: RefundFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (prev[field]) { const next = { ...prev }; delete next[field]; return next; }
      return prev;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      await mutateAsync({
        appointmentId: form.appointmentId,
        amount: Number(form.amount),
        reason: form.reason,
        effectiveAt: new Date(form.effectiveAt).toISOString(),
      });
      showSuccess('Refund created successfully');
      setForm(EMPTY_FORM);
      setErrors({});
      onCreated();
    } catch {
      showError('Failed to create refund');
    }
  }, [form, mutateAsync, showSuccess, showError, onCreated]);

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
          <Button variant="primary" loading={isPending} onClick={handleSubmit}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Appointment" required error={errors.appointmentId}>
          <TextInput
            value={form.appointmentId}
            onChange={(v) => updateField('appointmentId', v)}
            placeholder="Search appointment code..."
            aria-label="Appointment"
          />
        </FormField>
        <FormField label="Amount" required error={errors.amount}>
          <NumberInput
            value={form.amount}
            onChange={(v) => updateField('amount', v)}
            placeholder="0.00"
            aria-label="Amount"
          />
        </FormField>
        <FormField label="Effective Date" required error={errors.effectiveAt}>
          <DateInput
            value={form.effectiveAt}
            onChange={(v) => updateField('effectiveAt', v)}
            aria-label="Effective Date"
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
