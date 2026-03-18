import { useState, useEffect, useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { TextInput } from '@/components/forms/TextInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { useSnackbar } from '@/hooks/useSnackbar';
import { usePricingRuleSave } from '../hooks/usePricingRuleSave';
import type { PricingRuleFormData, PricingRuleFormErrors } from '../types';
import { EMPTY_PRICING_RULE_FORM } from '../types';
import type { PricingRule } from '../types';

const PAYOUT_TYPE_OPTIONS = [
  { value: 'FIXED', label: 'Fixed' },
  { value: 'PERCENTAGE', label: 'Percentage' },
];

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

interface PricingRuleFormDrawerProps {
  open: boolean;
  onClose: () => void;
  rule?: PricingRule | null;
  onSaved: () => void;
  tenantOptions?: { value: string; label: string }[];
  serviceTypeOptions?: { value: string; label: string }[];
  branchOptions?: { value: string; label: string }[];
}

export function PricingRuleFormDrawer({
  open,
  onClose,
  rule,
  onSaved,
  tenantOptions = [],
  serviceTypeOptions = [],
  branchOptions = [],
}: PricingRuleFormDrawerProps) {
  const isEditMode = !!rule;
  const { save, isSaving, validate } = usePricingRuleSave();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<PricingRuleFormData>(EMPTY_PRICING_RULE_FORM);
  const [initialData, setInitialData] = useState<PricingRuleFormData>(EMPTY_PRICING_RULE_FORM);
  const [errors, setErrors] = useState<PricingRuleFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isEditMode && rule) {
      const data: PricingRuleFormData = {
        tenantId: rule.tenantId,
        serviceTypeId: rule.serviceTypeId,
        branchId: rule.branchId ?? '',
        priceAmount: String(rule.priceAmount),
        payoutType: rule.payoutType,
        payoutValue: String(rule.payoutValue),
        status: rule.status,
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, rule]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_PRICING_RULE_FORM);
      setInitialData(EMPTY_PRICING_RULE_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(
    <K extends keyof PricingRuleFormData>(field: K, value: PricingRuleFormData[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => {
        if (prev[field]) {
          const next = { ...prev };
          delete next[field];
          return next;
        }
        return prev;
      });
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const result = await save(form, rule?.id);
    if (result.success) {
      showSuccess(isEditMode ? 'Pricing rule updated successfully' : 'Pricing rule created successfully');
      onSaved();
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, validate, save, rule, showSuccess, showError, onSaved]);

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const forceClose = useCallback(() => {
    setShowConfirm(false);
    onClose();
  }, [onClose]);

  const cancelDiscard = useCallback(() => {
    setShowConfirm(false);
  }, []);

  return (
    <>
      <DrawerPanel open={open} onClose={handleClose} size="narrow">
        <div className="flex h-full flex-col">
          <DrawerHeader
            title={isEditMode ? 'Edit Pricing Rule' : 'New Pricing Rule'}
            onClose={handleClose}
          />

          <>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="flex flex-col gap-6">
                <FormSection title="Rule Configuration" columns={2}>
                  <FormField label="Agency" error={errors.tenantId}>
                    <SelectInput
                      value={form.tenantId}
                      onChange={(v) => updateField('tenantId', v)}
                      options={[{ value: '', label: 'Select agency' }, ...tenantOptions]}
                      placeholder="Select agency"
                      error={!!errors.tenantId}
                      aria-label="Agency"
                    />
                  </FormField>
                  <FormField label="Service Type" required error={errors.serviceTypeId}>
                    <SelectInput
                      value={form.serviceTypeId}
                      onChange={(v) => updateField('serviceTypeId', v)}
                      options={[{ value: '', label: 'Select service type' }, ...serviceTypeOptions]}
                      placeholder="Select service type"
                      error={!!errors.serviceTypeId}
                      aria-label="Service Type"
                    />
                  </FormField>
                  <FormField label="Branch" error={errors.branchId}>
                    <SelectInput
                      value={form.branchId}
                      onChange={(v) => updateField('branchId', v)}
                      options={[{ value: '', label: 'All branches' }, ...branchOptions]}
                      placeholder="Select branch"
                      error={!!errors.branchId}
                      aria-label="Branch"
                    />
                  </FormField>
                  <FormField label="Status" error={errors.status}>
                    <SelectInput
                      value={form.status}
                      onChange={(v) => updateField('status', v)}
                      options={STATUS_OPTIONS}
                      aria-label="Status"
                    />
                  </FormField>
                </FormSection>

                <FormSection title="Pricing" columns={2}>
                  <FormField label="Price Amount" required error={errors.priceAmount}>
                    <TextInput
                      value={form.priceAmount}
                      onChange={(v) => updateField('priceAmount', v)}
                      placeholder="0.00"
                      error={!!errors.priceAmount}
                      aria-label="Price Amount"
                    />
                  </FormField>
                  <FormField label="Payout Type" required error={errors.payoutType}>
                    <SelectInput
                      value={form.payoutType}
                      onChange={(v) => updateField('payoutType', v)}
                      options={[{ value: '', label: 'Select payout type' }, ...PAYOUT_TYPE_OPTIONS]}
                      placeholder="Select payout type"
                      error={!!errors.payoutType}
                      aria-label="Payout Type"
                    />
                  </FormField>
                  <FormField label="Payout Value" required error={errors.payoutValue}>
                    <TextInput
                      value={form.payoutValue}
                      onChange={(v) => updateField('payoutValue', v)}
                      placeholder="0.00"
                      error={!!errors.payoutValue}
                      aria-label="Payout Value"
                    />
                  </FormField>
                </FormSection>
              </div>
            </div>

            <div className="border-t border-black/10 px-6 py-4">
              <FormActions>
                <Button variant="secondary" onClick={handleClose}>
                  Cancel
                </Button>
                <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                  {isEditMode ? 'Save' : 'Create Pricing Rule'}
                </Button>
              </FormActions>
            </div>
          </>
        </div>
      </DrawerPanel>

      <ConfirmDialog
        open={showConfirm}
        title="Discard changes?"
        message="You have unsaved changes. Do you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Continue editing"
        variant="warning"
        onConfirm={forceClose}
        onClose={cancelDiscard}
      />
    </>
  );
}
