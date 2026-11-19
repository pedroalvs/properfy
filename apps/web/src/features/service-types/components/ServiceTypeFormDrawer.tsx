import { useState, useEffect, useCallback } from 'react';
import {
  SERVICE_TYPE_DURATION_MIN_MINUTES,
  SERVICE_TYPE_DURATION_MAX_MINUTES,
} from '@properfy/shared';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { TextInput } from '@/components/forms/TextInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { NumberInput } from '@/components/forms/NumberInput';
import { Checkbox } from '@/components/forms/Checkbox';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useServiceTypeDetail } from '../hooks/useServiceTypeDetail';
import { useServiceTypeSave } from '../hooks/useServiceTypeSave';
import type { ServiceTypeFormData, ServiceTypeFormErrors } from '../types';
import { EMPTY_SERVICE_TYPE_FORM } from '../types';

const FLOW_TYPE_OPTIONS = [
  { value: 'ROUTINE', label: 'Routine' },
  { value: 'INGOING', label: 'Ingoing' },
  { value: 'OUTGOING', label: 'Outgoing' },
];

const DURATION_FIELD_ID = 'service-type-duration';
const DURATION_HELP_ID = 'service-type-duration-help';

interface ServiceTypeFormDrawerProps {
  open: boolean;
  onClose: () => void;
  serviceTypeId?: string | null;
  onSaved: () => void;
}

export function ServiceTypeFormDrawer({
  open,
  onClose,
  serviceTypeId,
  onSaved,
}: ServiceTypeFormDrawerProps) {
  const isEditMode = !!serviceTypeId;
  const { serviceType, isLoading: isLoadingDetail, isError: isDetailError, refetch } = useServiceTypeDetail(
    isEditMode ? serviceTypeId : null,
  );
  const { save, isSaving, validate } = useServiceTypeSave();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<ServiceTypeFormData>(EMPTY_SERVICE_TYPE_FORM);
  const [initialData, setInitialData] = useState<ServiceTypeFormData>(EMPTY_SERVICE_TYPE_FORM);
  const [errors, setErrors] = useState<ServiceTypeFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isEditMode && serviceType) {
      const data: ServiceTypeFormData = {
        code: serviceType.code,
        name: serviceType.name,
        flowType: serviceType.flowType,
        requiresRentalTenantConfirmation: serviceType.requiresRentalTenantConfirmation,
        defaultDurationMinutes: String(serviceType.defaultDurationMinutes),
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, serviceType]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_SERVICE_TYPE_FORM);
      setInitialData(EMPTY_SERVICE_TYPE_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(
    <K extends keyof ServiceTypeFormData>(field: K, value: ServiceTypeFormData[K]) => {
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

    const result = await save(form, serviceTypeId ?? undefined);
    if (result.success) {
      showSuccess(isEditMode ? 'Service type updated successfully' : 'Service type created successfully');
      onSaved();
    } else if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
      // A server validation error (e.g. a stale bundle sending an out-of-range
      // duration) is shown on the offending field rather than as a snackbar.
      setErrors((prev) => ({ ...prev, ...result.fieldErrors }));
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, validate, save, serviceTypeId, showSuccess, showError, onSaved]);

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
            title={isEditMode ? 'Edit Service Type' : 'New Service Type'}
            onClose={handleClose}
          />

          {isEditMode && isLoadingDetail ? (
            <div className="flex-1 px-6 py-4">
              <LoadingState rows={5} />
            </div>
          ) : isEditMode && isDetailError ? (
            // A failed detail fetch must not fall through to an empty form (#392).
            <div className="flex-1 px-6 py-4">
              <ErrorState
                message="Failed to load service type."
                detail="Please try again."
                onRetry={refetch}
              />
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="flex flex-col gap-6">
                  <FormSection title="Service Type Information" columns={2}>
                    <FormField label="Code" required error={errors.code}>
                      <TextInput
                        value={form.code}
                        onChange={(v) => updateField('code', v.toUpperCase())}
                        placeholder="e.g. ROUTINE_IN"
                        error={!!errors.code}
                        aria-label="Code"
                        disabled={isEditMode}
                      />
                    </FormField>
                    <FormField label="Name" required error={errors.name}>
                      <TextInput
                        value={form.name}
                        onChange={(v) => updateField('name', v)}
                        placeholder="Service type name"
                        error={!!errors.name}
                        aria-label="Name"
                      />
                    </FormField>
                    <FormField label="Flow Type" required error={errors.flowType}>
                      <SelectInput
                        value={form.flowType}
                        onChange={(v) => updateField('flowType', v)}
                        options={FLOW_TYPE_OPTIONS}
                        placeholder="Select flow type"
                        error={!!errors.flowType}
                        aria-label="Flow Type"
                      />
                    </FormField>
                    <FormField
                      label="Estimated duration (min)"
                      required
                      htmlFor={DURATION_FIELD_ID}
                      error={errors.defaultDurationMinutes}
                    >
                      <NumberInput
                        id={DURATION_FIELD_ID}
                        value={form.defaultDurationMinutes}
                        onChange={(v) => updateField('defaultDurationMinutes', v)}
                        min={SERVICE_TYPE_DURATION_MIN_MINUTES}
                        max={SERVICE_TYPE_DURATION_MAX_MINUTES}
                        step={1}
                        error={!!errors.defaultDurationMinutes}
                        aria-label="Estimated duration (min)"
                        aria-describedby={DURATION_HELP_ID}
                      />
                      <p id={DURATION_HELP_ID} className="mt-1 text-xs text-text-muted">
                        Time the inspector spends at each stop. Used to plan the day route.
                      </p>
                    </FormField>
                  </FormSection>

                  <FormSection title="Options">
                    <Checkbox
                      label="Requires tenant confirmation"
                      checked={form.requiresRentalTenantConfirmation}
                      onChange={(v) => updateField('requiresRentalTenantConfirmation', v)}
                    />
                  </FormSection>
                </div>
              </div>

              <div className="border-t border-black/10 px-6 py-4">
                <FormActions>
                  <Button variant="secondary" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                    {isEditMode ? 'Save' : 'Create Service Type'}
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
