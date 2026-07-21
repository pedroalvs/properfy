import { useState, useCallback } from 'react';
import { createManualAdjustmentSchema } from '@properfy/shared';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { NumberInput } from '@/components/forms/NumberInput';
import { DateInput } from '@/components/forms/DateInput';
import { Textarea } from '@/components/forms/Textarea';
import { useSnackbar } from '@/hooks/useSnackbar';
import { getErrorMessage } from '@/lib/api-error';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
import { useTenantAdminDetail } from '@/features/tenants/hooks/useTenantAdminDetail';
import { useCreateAdjustment } from '../hooks/useCreateAdjustment';
import { TextInput } from '@/components/forms/TextInput';
import { SelectInput } from '@/components/forms/SelectInput';

interface CreateAdjustmentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface AdjustmentFormData {
  tenantId: string;
  amount: string;
  effectiveAt: string;
  description: string;
  reason: string;
}

type AdjustmentFormErrors = Partial<Record<keyof AdjustmentFormData, string>>;

const EMPTY_FORM: AdjustmentFormData = {
  tenantId: '',
  amount: '',
  effectiveAt: '',
  description: '',
  reason: '',
};

function validate(data: AdjustmentFormData): AdjustmentFormErrors {
  const errors: AdjustmentFormErrors = {};

  if (!data.tenantId.trim()) errors.tenantId = 'Required field';
  if (!data.effectiveAt.trim()) errors.effectiveAt = 'Required field';

  const schemaPayload = {
    tenantId: data.tenantId.trim() || undefined,
    amount: data.amount.trim() ? Number(data.amount) : undefined,
    description: data.description.trim() || undefined,
    reason: data.reason.trim() || undefined,
    ...(data.effectiveAt.trim() ? { effectiveAt: new Date(data.effectiveAt).toISOString() } : {}),
  };

  const result = createManualAdjustmentSchema.safeParse(schemaPayload);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      if (path === 'amount' && !errors.amount) {
        errors.amount = 'Required field';
      }
      if (path === 'description' && !errors.description) {
        errors.description = 'Required field';
      }
      if (path === 'reason' && !errors.reason) {
        errors.reason = 'Required field';
      }
    }
  }

  return errors;
}

export function CreateAdjustmentModal({ open, onClose, onCreated }: CreateAdjustmentModalProps) {
  const { user } = useAuth();
  const [form, setForm] = useState<AdjustmentFormData>({ ...EMPTY_FORM, tenantId: user?.tenantId ?? '' });
  const [errors, setErrors] = useState<AdjustmentFormErrors>({});
  const { mutateAsync, isPending } = useCreateAdjustment();
  const { showSuccess, showError } = useSnackbar();
  const { options: agencyOptions } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'form-options'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
  );
  // The tenants list is capped at one page (100), so a locked agency outside
  // that page would otherwise show no label. Resolve it directly by id.
  const { tenant: lockedTenant } = useTenantAdminDetail(user?.tenantId ?? null);
  const resolvedTenantId = form.tenantId || user?.tenantId || '';
  const agencySelectOptions = agencyOptions.some((o) => o.value === resolvedTenantId) || !lockedTenant
    ? agencyOptions
    : [...agencyOptions, { value: lockedTenant.id, label: lockedTenant.name }];

  const updateField = useCallback(<K extends keyof AdjustmentFormData>(field: K, value: AdjustmentFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (prev[field]) { const next = { ...prev }; delete next[field]; return next; }
      return prev;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    const submission = {
      ...form,
      tenantId: resolvedTenantId,
    };
    const validationErrors = validate(submission);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      await mutateAsync({
        tenantId: submission.tenantId,
        amount: Number(submission.amount),
        effectiveAt: new Date(submission.effectiveAt).toISOString(),
        description: submission.description,
        reason: submission.reason,
      });
      showSuccess('Adjustment created successfully');
      setForm({ ...EMPTY_FORM, tenantId: user?.tenantId ?? '' });
      setErrors({});
      onCreated();
    } catch (err) {
      showError(getErrorMessage(err, 'Failed to create adjustment'));
    }
  }, [form, mutateAsync, onCreated, resolvedTenantId, showError, showSuccess, user?.tenantId]);

  const handleClose = useCallback(() => {
    setForm({ ...EMPTY_FORM, tenantId: user?.tenantId ?? '' });
    setErrors({});
    onClose();
  }, [onClose, user?.tenantId]);

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
        <FormField
          label="Agency"
          required
          error={errors.tenantId}
          hint={user?.tenantId ? 'Using the agency from your current session.' : 'Required for cross-agency manual adjustments.'}
        >
          <SelectInput
            value={resolvedTenantId}
            onChange={(v) => updateField('tenantId', v)}
            options={agencySelectOptions}
            disabled={Boolean(user?.tenantId)}
            placeholder="Select an agency"
            aria-label="Agency"
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
            placeholder="Describe the reason for this adjustment"
            aria-label="Reason"
          />
        </FormField>
      </div>
    </Dialog>
  );
}
