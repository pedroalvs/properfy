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
import { Textarea } from '@/components/forms/Textarea';
import { Checkbox } from '@/components/forms/Checkbox';
import { useSnackbar } from '@/hooks/useSnackbar';
import { usePermissions } from '@/hooks/usePermissions';
import { useTenantAdminDetail } from '../hooks/useTenantAdminDetail';
import { useTenantAdminSave } from '../hooks/useTenantAdminSave';
import type { TenantAdminFormData, TenantAdminFormErrors } from '../types';
import { EMPTY_TENANT_ADMIN_FORM } from '../types';

const CURRENCY_OPTIONS = [
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'BRL', label: 'BRL - Brazilian Real' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'USD', label: 'USD - US Dollar' },
];

interface TenantFormDrawerProps {
  open: boolean;
  onClose: () => void;
  tenantId?: string | null;
  onSaved: () => void;
}

export function TenantFormDrawer({
  open,
  onClose,
  tenantId,
  onSaved,
}: TenantFormDrawerProps) {
  const isEditMode = !!tenantId;
  const { tenant, isLoading: isLoadingDetail } = useTenantAdminDetail(
    isEditMode ? tenantId : null,
  );
  const { save, isSaving, validate } = useTenantAdminSave();
  const { showSuccess, showError } = useSnackbar();
  // Only AM can change agency settings (update-tenant.use-case restricts settings
  // to AM; OP cannot PATCH tenants), so hide the email toggle for non-AM users.
  const { hasRole } = usePermissions();
  const isAdminMaster = hasRole('AM');

  const [form, setForm] = useState<TenantAdminFormData>(EMPTY_TENANT_ADMIN_FORM);
  const [initialData, setInitialData] = useState<TenantAdminFormData>(EMPTY_TENANT_ADMIN_FORM);
  const [errors, setErrors] = useState<TenantAdminFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isEditMode && tenant) {
      const data: TenantAdminFormData = {
        name: tenant.name,
        legalName: tenant.legalName ?? '',
        currency: tenant.currency,
        appointmentCodePrefix: tenant.appointmentCodePrefix ?? '',
        notes: tenant.notes ?? '',
        // Read uses settingsJson (the GET response key). Missing/absent = enabled.
        emailSendingEnabled: (tenant.settingsJson?.['emailSendingEnabled'] as boolean | undefined) ?? true,
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, tenant]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_TENANT_ADMIN_FORM);
      setInitialData(EMPTY_TENANT_ADMIN_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(
    <K extends keyof TenantAdminFormData>(field: K, value: TenantAdminFormData[K]) => {
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
    const validationErrors = validate(form, { isCreate: !isEditMode });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const result = await save(form, tenantId ?? undefined);
    if (result.success) {
      showSuccess(isEditMode ? 'Agency updated successfully' : 'Agency created successfully');
      onSaved();
    } else if (result.fieldErrors) {
      // Inline field-level errors (e.g. a 409 prefix conflict).
      setErrors(result.fieldErrors);
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, validate, save, tenantId, showSuccess, showError, onSaved]);

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
      <DrawerPanel open={open} onClose={handleClose} size="wide">
        <div className="flex h-full flex-col">
          <DrawerHeader
            title={isEditMode ? 'Edit Agency' : 'New Agency'}
            onClose={handleClose}
          />

          {isEditMode && isLoadingDetail ? (
            <div className="flex-1 px-6 py-4">
              <LoadingState rows={6} />
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="flex flex-col gap-6">
                  <FormSection title="Agency Information" columns={2}>
                    <FormField label="Name" required error={errors.name}>
                      <TextInput
                        value={form.name}
                        onChange={(v) => updateField('name', v)}
                        placeholder="Agency name"
                        error={!!errors.name}
                        aria-label="Name"
                      />
                    </FormField>
                    <FormField label="Legal Name" required error={errors.legalName}>
                      <TextInput
                        value={form.legalName}
                        onChange={(v) => updateField('legalName', v)}
                        placeholder="Legal entity name"
                        error={!!errors.legalName}
                        aria-label="Legal Name"
                      />
                    </FormField>
                    <FormField label="Currency" required error={errors.currency}>
                      <SelectInput
                        value={form.currency}
                        onChange={(v) => updateField('currency', v)}
                        options={CURRENCY_OPTIONS}
                        placeholder="Select currency"
                        error={!!errors.currency}
                        aria-label="Currency"
                      />
                    </FormField>
                    <FormField
                      label="Appointment code prefix"
                      required
                      error={errors.appointmentCodePrefix}
                      hint="3–4 letters or numbers, unique per agency (e.g. INS → INS-0042)."
                    >
                      <TextInput
                        value={form.appointmentCodePrefix}
                        onChange={(v) => updateField('appointmentCodePrefix', v.toUpperCase())}
                        placeholder="INS"
                        maxLength={4}
                        error={!!errors.appointmentCodePrefix}
                        aria-label="Appointment code prefix"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Notes">
                    <FormField label="Notes" error={errors.notes}>
                      <Textarea
                        value={form.notes}
                        onChange={(v) => updateField('notes', v)}
                        rows={4}
                        placeholder="Additional information"
                        aria-label="Notes"
                      />
                    </FormField>
                  </FormSection>

                  {isAdminMaster && (
                    <FormSection title="Email">
                      <Checkbox
                        checked={form.emailSendingEnabled}
                        onChange={(v) => updateField('emailSendingEnabled', v)}
                        label="Send automated emails"
                      />
                    </FormSection>
                  )}
                </div>
              </div>

              <div className="border-t border-black/10 px-6 py-4">
                <FormActions>
                  <Button variant="secondary" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                    {isEditMode ? 'Save' : 'Create Agency'}
                  </Button>
                </FormActions>
              </div>
            </>
          )}
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
