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
import { useFormOptions } from '@/hooks/useFormOptions';
import { useUserDetail } from '../hooks/useUserDetail';
import { useUserSave } from '../hooks/useUserSave';
import { USER_ROLE_OPTIONS, USER_STATUS_OPTIONS } from '../constants/form-options';
import type { UserFormData, UserFormErrors } from '../types';
import { EMPTY_USER_FORM } from '../types';

interface UserFormDrawerProps {
  open: boolean;
  onClose: () => void;
  userId?: string | null;
  onSaved: () => void;
}

export function UserFormDrawer({
  open,
  onClose,
  userId,
  onSaved,
}: UserFormDrawerProps) {
  const { options: branchOptions } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'form-options'],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
  );

  const isEditMode = !!userId;
  const { user, isLoading: isLoadingDetail } = useUserDetail(
    isEditMode ? userId : null,
  );
  const { save, isSaving, validate } = useUserSave();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<UserFormData>(EMPTY_USER_FORM);
  const [initialData, setInitialData] = useState<UserFormData>(EMPTY_USER_FORM);
  const [errors, setErrors] = useState<UserFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isEditMode && user) {
      const data: UserFormData = {
        name: user.name,
        email: user.email,
        phone: user.phone ?? '',
        role: user.role,
        status: user.status,
        branchId: user.branchId ?? '',
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, user]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_USER_FORM);
      setInitialData(EMPTY_USER_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(
    <K extends keyof UserFormData>(field: K, value: UserFormData[K]) => {
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
    const mode = isEditMode ? 'edit' : 'create';
    const validationErrors = validate(form, mode);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    const result = await save(form, userId ?? undefined);
    if (result.success) {
      showSuccess(isEditMode ? 'User updated successfully' : 'User created successfully');
      onSaved();
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, validate, save, userId, showSuccess, showError, onSaved]);

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
            title={isEditMode ? 'Edit User' : 'New User'}
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
                  <FormSection title="Personal Details" columns={2}>
                    <FormField label="Name" required error={errors.name}>
                      <TextInput
                        value={form.name}
                        onChange={(v) => updateField('name', v)}
                        aria-label="Name"
                      />
                    </FormField>
                    <FormField label="Email" required error={errors.email}>
                      <TextInput
                        value={form.email}
                        onChange={(v) => updateField('email', v)}
                        aria-label="Email"
                      />
                    </FormField>
                    <FormField label="Phone" error={errors.phone}>
                      <TextInput
                        value={form.phone}
                        onChange={(v) => updateField('phone', v)}
                        type="tel"
                        aria-label="Phone"
                      />
                    </FormField>
                    <FormField label="Role" required error={errors.role}>
                      <SelectInput
                        value={form.role}
                        onChange={(v) => updateField('role', v)}
                        options={USER_ROLE_OPTIONS}
                        placeholder="Select role"
                        aria-label="Role"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Assignment" columns={2}>
                    <FormField label="Branch" error={errors.branchId}>
                      <SelectInput
                        value={form.branchId}
                        onChange={(v) => updateField('branchId', v)}
                        options={branchOptions}
                        placeholder="None"
                        aria-label="Branch"
                      />
                    </FormField>
                  </FormSection>

                  {isEditMode && (
                    <FormSection title="Status">
                      <FormField label="Status" error={errors.status}>
                        <SelectInput
                          value={form.status}
                          onChange={(v) => updateField('status', v)}
                          options={USER_STATUS_OPTIONS}
                          aria-label="Status"
                        />
                      </FormField>
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
                    {isEditMode ? 'Save' : 'Create User'}
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
