import { useState, useEffect, useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { TextInput } from '@/components/forms/TextInput';
import { NumberInput } from '@/components/forms/NumberInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useFormOptions } from '@/hooks/useFormOptions';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@properfy/shared';
import { useTimeSlotSave, type TimeSlot, type TimeSlotSaveData } from '../hooks/useTimeSlotAdmin';

interface TimeSlotFormDrawerProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  slot?: TimeSlot | null;
  /** Pre-selected tenant for create mode */
  defaultTenantId?: string;
  /** Pre-selected branch for create mode */
  defaultBranchId?: string | null;
}

interface FormData {
  tenantId: string;
  branchId: string;
  label: string;
  startTime: string;
  endTime: string;
  sortOrder: string;
}

type FormErrors = Partial<Record<keyof FormData, string>>;

const EMPTY_FORM: FormData = {
  tenantId: '',
  branchId: '',
  label: '',
  startTime: '',
  endTime: '',
  sortOrder: '0',
};

const TIME_REGEX = /^\d{2}:\d{2}$/;

function validateForm(data: FormData, isEditMode: boolean, isAdminUser: boolean): FormErrors {
  const errors: FormErrors = {};

  if (!data.label.trim()) errors.label = 'Required field';
  if (!data.startTime.trim()) {
    errors.startTime = 'Required field';
  } else if (!TIME_REGEX.test(data.startTime)) {
    errors.startTime = 'Format: HH:MM';
  }
  if (!data.endTime.trim()) {
    errors.endTime = 'Required field';
  } else if (!TIME_REGEX.test(data.endTime)) {
    errors.endTime = 'Format: HH:MM';
  }
  if (data.startTime && data.endTime && !errors.startTime && !errors.endTime && data.startTime >= data.endTime) {
    errors.endTime = 'End time must be after start time';
  }
  if (!isEditMode && isAdminUser && !data.tenantId) {
    errors.tenantId = 'Required field';
  }

  return errors;
}

export function TimeSlotFormDrawer({
  open,
  onClose,
  onSaved,
  slot,
  defaultTenantId,
  defaultBranchId,
}: TimeSlotFormDrawerProps) {
  const { user } = useAuth();
  const isEditMode = !!slot;
  const isAdminUser = user?.role === UserRole.AM || user?.role === UserRole.OP;
  const { save, isSaving } = useTimeSlotSave();
  const { showSuccess, showError } = useSnackbar();

  const { options: tenantOptions, isLoading: isLoadingTenants } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'time-slot-form-options'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
    undefined,
    { enabled: isAdminUser },
  );

  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [savedForm, setSavedForm] = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  const selectedTenantId = form.tenantId || user?.tenantId || '';

  const { options: branchOptions, isLoading: isLoadingBranches } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'time-slot-form-options', selectedTenantId],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
    { tenantId: selectedTenantId },
    { enabled: !!selectedTenantId },
  );

  const branchOptionsWithDefault = [
    { value: '', label: 'Tenant Default' },
    ...branchOptions,
  ];

  useEffect(() => {
    if (isEditMode && slot) {
      const data: FormData = {
        tenantId: slot.tenantId ?? '',
        branchId: slot.branchId ?? '',
        label: slot.label,
        startTime: slot.startTime,
        endTime: slot.endTime,
        sortOrder: String(slot.sortOrder),
      };
      setForm(data);
      setSavedForm(data);
      setErrors({});
    }
  }, [isEditMode, slot]);

  useEffect(() => {
    if (open && !isEditMode) {
      const initial: FormData = {
        ...EMPTY_FORM,
        tenantId: defaultTenantId ?? (isAdminUser ? '' : (user?.tenantId ?? '')),
        branchId: defaultBranchId ?? '',
      };
      setForm(initial);
      setSavedForm(initial);
      setErrors({});
    }
  }, [open, isEditMode, defaultTenantId, defaultBranchId, isAdminUser, user?.tenantId]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  const updateField = useCallback(
    <K extends keyof FormData>(field: K, value: FormData[K]) => {
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
    const validationErrors = validateForm(form, isEditMode, isAdminUser);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const payload: TimeSlotSaveData = {
      label: form.label.trim(),
      startTime: form.startTime,
      endTime: form.endTime,
      sortOrder: Number(form.sortOrder) || 0,
    };

    if (!isEditMode) {
      if (form.tenantId) payload.tenantId = form.tenantId;
      if (form.branchId) payload.branchId = form.branchId;
    }

    const result = await save(payload, slot?.id);
    if (result.success) {
      showSuccess(isEditMode ? 'Time slot updated successfully' : 'Time slot created successfully');
      onSaved();
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, isAdminUser, form, save, slot?.id, showSuccess, showError, onSaved]);

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
            title={isEditMode ? 'Edit Time Slot' : 'New Time Slot'}
            onClose={handleClose}
          />

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-6">
              {!isEditMode && (
                <FormSection title="Scope" columns={2}>
                  {isAdminUser && (
                    <FormField label="Tenant" required error={errors.tenantId}>
                      <SelectInput
                        value={form.tenantId}
                        onChange={(v) => {
                          updateField('tenantId', v);
                          updateField('branchId', '');
                        }}
                        options={tenantOptions}
                        placeholder={isLoadingTenants ? 'Loading...' : 'Select tenant'}
                        aria-label="Tenant"
                      />
                    </FormField>
                  )}
                  <FormField label="Branch" error={errors.branchId}>
                    <SelectInput
                      value={form.branchId}
                      onChange={(v) => updateField('branchId', v)}
                      options={branchOptionsWithDefault}
                      placeholder={isLoadingBranches ? 'Loading...' : 'Select branch'}
                      disabled={!selectedTenantId}
                      aria-label="Branch"
                    />
                  </FormField>
                </FormSection>
              )}

              <FormSection title="Slot Details" columns={2}>
                <FormField label="Label" required error={errors.label}>
                  <TextInput
                    value={form.label}
                    onChange={(v) => updateField('label', v)}
                    placeholder="e.g. Morning"
                    aria-label="Label"
                  />
                </FormField>
                <FormField label="Sort Order" error={errors.sortOrder}>
                  <NumberInput
                    value={form.sortOrder}
                    onChange={(v) => updateField('sortOrder', v)}
                    placeholder="0"
                    aria-label="Sort Order"
                  />
                </FormField>
                <FormField label="Start Time" required error={errors.startTime}>
                  <TextInput
                    value={form.startTime}
                    onChange={(v) => updateField('startTime', v)}
                    placeholder="HH:MM"
                    error={!!errors.startTime}
                    aria-label="Start Time"
                  />
                </FormField>
                <FormField label="End Time" required error={errors.endTime}>
                  <TextInput
                    value={form.endTime}
                    onChange={(v) => updateField('endTime', v)}
                    placeholder="HH:MM"
                    error={!!errors.endTime}
                    aria-label="End Time"
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
                {isEditMode ? 'Save' : 'Create Time Slot'}
              </Button>
            </FormActions>
          </div>
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
