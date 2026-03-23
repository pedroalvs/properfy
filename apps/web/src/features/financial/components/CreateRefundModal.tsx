import { useState, useCallback } from 'react';
import { createRefundSchema } from '@properfy/shared';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { Textarea } from '@/components/forms/Textarea';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useCreateRefund } from '../hooks/useCreateRefund';

interface CreateRefundModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface RefundFormData {
  entryId: string;
  description: string;
  reason: string;
}

type RefundFormErrors = Partial<Record<keyof RefundFormData, string>>;

const EMPTY_FORM: RefundFormData = {
  entryId: '',
  description: '',
  reason: '',
};

function validate(data: RefundFormData): RefundFormErrors {
  const errors: RefundFormErrors = {};
  if (!data.entryId.trim()) errors.entryId = 'Required field';

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
        entryId: form.entryId,
        description: form.description,
        reason: form.reason,
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
        <FormField label="Financial Entry ID" required error={errors.entryId}>
          <TextInput
            value={form.entryId}
            onChange={(v) => updateField('entryId', v)}
            placeholder="Financial entry UUID"
            aria-label="Financial Entry ID"
          />
        </FormField>
        <FormField label="Description" required error={errors.description}>
          <TextInput
            value={form.description}
            onChange={(v) => updateField('description', v)}
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
