import { useState, useCallback } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { DateInput } from '@/components/forms/DateInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useGenerateInvoice } from '../hooks/useGenerateInvoice';

const FREQUENCY_OPTIONS = [
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Biweekly', value: 'BIWEEKLY' },
  { label: 'Monthly', value: 'MONTHLY' },
];

interface GenerateInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  onGenerated: () => void;
}

interface InvoiceFormData {
  inspectorId: string;
  periodStart: string;
  periodEnd: string;
  frequency: string;
}

type InvoiceFormErrors = Partial<Record<keyof InvoiceFormData, string>>;

const EMPTY_FORM: InvoiceFormData = {
  inspectorId: '',
  periodStart: '',
  periodEnd: '',
  frequency: 'MONTHLY',
};

function validate(data: InvoiceFormData): InvoiceFormErrors {
  const errors: InvoiceFormErrors = {};
  if (!data.inspectorId.trim()) errors.inspectorId = 'Required field';
  if (!data.periodStart.trim()) errors.periodStart = 'Required field';
  if (!data.periodEnd.trim()) errors.periodEnd = 'Required field';
  if (!data.frequency) errors.frequency = 'Required field';
  if (data.periodStart && data.periodEnd && data.periodStart > data.periodEnd) {
    errors.periodEnd = 'End date must be after start date';
  }
  return errors;
}

export function GenerateInvoiceModal({ open, onClose, onGenerated }: GenerateInvoiceModalProps) {
  const [form, setForm] = useState<InvoiceFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<InvoiceFormErrors>({});
  const { mutateAsync, isPending } = useGenerateInvoice();
  const { showSuccess, showError } = useSnackbar();

  const updateField = useCallback(<K extends keyof InvoiceFormData>(field: K, value: InvoiceFormData[K]) => {
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
        inspectorId: form.inspectorId,
        periodStart: new Date(form.periodStart).toISOString(),
        periodEnd: new Date(form.periodEnd).toISOString(),
        frequency: form.frequency as 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY',
      });
      showSuccess('Invoice generated successfully');
      setForm(EMPTY_FORM);
      setErrors({});
      onGenerated();
    } catch {
      showError('Failed to generate invoice');
    }
  }, [form, mutateAsync, showSuccess, showError, onGenerated]);

  const handleClose = useCallback(() => {
    setForm(EMPTY_FORM);
    setErrors({});
    onClose();
  }, [onClose]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Generate Invoice"
      actions={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" loading={isPending} onClick={handleSubmit}>
            Generate
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Inspector" required error={errors.inspectorId}>
          <TextInput
            value={form.inspectorId}
            onChange={(v) => updateField('inspectorId', v)}
            placeholder="Search inspector..."
            aria-label="Inspector"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Period Start" required error={errors.periodStart}>
            <DateInput
              value={form.periodStart}
              onChange={(v) => updateField('periodStart', v)}
              aria-label="Period Start"
            />
          </FormField>
          <FormField label="Period End" required error={errors.periodEnd}>
            <DateInput
              value={form.periodEnd}
              onChange={(v) => updateField('periodEnd', v)}
              aria-label="Period End"
            />
          </FormField>
        </div>
        <FormField label="Frequency" required error={errors.frequency}>
          <SelectInput
            value={form.frequency}
            onChange={(v) => updateField('frequency', v)}
            options={FREQUENCY_OPTIONS}
            placeholder="Select frequency"
            aria-label="Frequency"
          />
        </FormField>
      </div>
    </Dialog>
  );
}
