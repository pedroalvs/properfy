import { useState, useCallback } from 'react';
import { generateInvoiceSchema } from '@properfy/shared';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { DateInput } from '@/components/forms/DateInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
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
  tenantId?: string;
}

interface InvoiceFormData {
  inspectorId: string;
  periodStart: string;
  periodEnd: string;
  periodType: string;
}

type InvoiceFormErrors = Partial<Record<keyof InvoiceFormData, string>>;

const EMPTY_FORM: InvoiceFormData = {
  inspectorId: '',
  periodStart: '',
  periodEnd: '',
  periodType: 'MONTHLY',
};

function validate(data: InvoiceFormData): InvoiceFormErrors {
  const errors: InvoiceFormErrors = {};
  if (!data.periodStart.trim()) errors.periodStart = 'Required field';
  if (!data.periodEnd.trim()) errors.periodEnd = 'Required field';
  if (!data.periodType) errors.periodType = 'Required field';
  if (data.periodStart && data.periodEnd && data.periodStart > data.periodEnd) {
    errors.periodEnd = 'End date must be after start date';
  }

  const result = generateInvoiceSchema.safeParse({
    inspectorId: data.inspectorId.trim() || undefined,
    periodStart: data.periodStart.trim() || undefined,
    periodEnd: data.periodEnd.trim() || undefined,
    periodType: data.periodType || undefined,
  });
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      if (path === 'inspectorId' && !errors.inspectorId) {
        errors.inspectorId = data.inspectorId.trim() ? 'Invalid inspector ID' : 'Required field';
      }
      if (path === 'periodStart' && !errors.periodStart) {
        errors.periodStart = 'Required field';
      }
      if (path === 'periodEnd' && !errors.periodEnd) {
        errors.periodEnd = issue.message === 'periodEnd must be >= periodStart'
          ? 'End date must be after start date'
          : 'Required field';
      }
    }
  }

  return errors;
}

export function GenerateInvoiceModal({ open, onClose, onGenerated, tenantId }: GenerateInvoiceModalProps) {
  const { user } = useAuth();
  const isGlobalRole = user?.role === 'AM' || user?.role === 'OP';
  const [form, setForm] = useState<InvoiceFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<InvoiceFormErrors>({});
  const { mutateAsync, isPending } = useGenerateInvoice();
  const { showSuccess, showError } = useSnackbar();
  const { options: inspectorOptions, isLoading: isLoadingInspectors } = useFormOptions<{ id: string; name: string | null }>(
    ['inspectors', 'invoice-form-options', tenantId ?? ''],
    '/v1/inspectors',
    (item) => ({ value: item.id, label: item.name ?? item.id }),
    tenantId ? { tenantId } : undefined,
    { enabled: open && (!isGlobalRole || !!tenantId) },
  );

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
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        periodType: form.periodType as 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY',
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
          <SelectInput
            value={form.inspectorId}
            onChange={(v) => updateField('inspectorId', v)}
            options={inspectorOptions}
            placeholder={
              isGlobalRole && !tenantId
                ? 'Select agency first'
                : isLoadingInspectors
                  ? 'Loading...'
                  : 'Select inspector'
            }
            disabled={isGlobalRole && !tenantId}
            aria-label="Inspector"
          />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <FormField label="Frequency" required error={errors.periodType}>
          <SelectInput
            value={form.periodType}
            onChange={(v) => updateField('periodType', v)}
            options={FREQUENCY_OPTIONS}
            placeholder="Select frequency"
            aria-label="Frequency"
          />
        </FormField>
      </div>
    </Dialog>
  );
}
