import { useState, useCallback } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { NumberInput } from '@/components/forms/NumberInput';
import { DateInput } from '@/components/forms/DateInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { Textarea } from '@/components/forms/Textarea';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useCreateAdjustment } from '../hooks/useCreateAdjustment';

const ADJUSTMENT_TYPE_OPTIONS = [
  { label: 'Manual Adjustment', value: 'MANUAL_ADJUSTMENT' },
];

interface CreateAdjustmentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface AdjustmentFormData {
  amount: string;
  effectiveAt: string;
  notes: string;
  entryType: string;
}

type AdjustmentFormErrors = Partial<Record<keyof AdjustmentFormData, string>>;

const EMPTY_FORM: AdjustmentFormData = {
  amount: '',
  effectiveAt: '',
  notes: '',
  entryType: 'MANUAL_ADJUSTMENT',
};

function validate(data: AdjustmentFormData): AdjustmentFormErrors {
  const errors: AdjustmentFormErrors = {};
  if (!data.amount.trim()) errors.amount = 'Required field';
  if (!data.effectiveAt.trim()) errors.effectiveAt = 'Required field';
  if (!data.notes.trim()) {
    errors.notes = 'Required field';
  } else if (data.notes.trim().length < 10) {
    errors.notes = 'Notes must be at least 10 characters';
  }
  if (!data.entryType) errors.entryType = 'Required field';
  return errors;
}

export function CreateAdjustmentModal({ open, onClose, onCreated }: CreateAdjustmentModalProps) {
  const [form, setForm] = useState<AdjustmentFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<AdjustmentFormErrors>({});
  const { mutateAsync, isPending } = useCreateAdjustment();
  const { showSuccess, showError } = useSnackbar();

  const updateField = useCallback(<K extends keyof AdjustmentFormData>(field: K, value: AdjustmentFormData[K]) => {
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
        amount: Number(form.amount),
        effectiveAt: new Date(form.effectiveAt).toISOString(),
        notes: form.notes,
        entryType: form.entryType,
      });
      showSuccess('Adjustment created successfully');
      setForm(EMPTY_FORM);
      setErrors({});
      onCreated();
    } catch {
      showError('Failed to create adjustment');
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
      title="Create Adjustment"
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
        <FormField label="Entry Type" required error={errors.entryType}>
          <SelectInput
            value={form.entryType}
            onChange={(v) => updateField('entryType', v)}
            options={ADJUSTMENT_TYPE_OPTIONS}
            placeholder="Select type"
            aria-label="Entry Type"
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
        <FormField label="Notes" required error={errors.notes}>
          <Textarea
            value={form.notes}
            onChange={(v) => updateField('notes', v)}
            rows={3}
            placeholder="Describe the reason for this adjustment (min 10 characters)"
            aria-label="Notes"
          />
        </FormField>
      </div>
    </Dialog>
  );
}
