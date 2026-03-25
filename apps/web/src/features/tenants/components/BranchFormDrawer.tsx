import { useState, useEffect, useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { TextInput } from '@/components/forms/TextInput';
import { EmailInput } from '@/components/forms/EmailInput';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useBranchSave } from '../hooks/useBranchSave';
import type { Branch, BranchFormData, BranchFormErrors } from '../types';
import { EMPTY_BRANCH_FORM } from '../types';

interface BranchFormDrawerProps {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  branch?: Branch | null;
  onSaved: () => void;
}

export function BranchFormDrawer({
  open,
  onClose,
  tenantId,
  branch,
  onSaved,
}: BranchFormDrawerProps) {
  const isEditMode = !!branch;
  const { save, isSaving, validate } = useBranchSave();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<BranchFormData>(EMPTY_BRANCH_FORM);
  const [initialData, setInitialData] = useState<BranchFormData>(EMPTY_BRANCH_FORM);
  const [errors, setErrors] = useState<BranchFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isEditMode && branch) {
      const data: BranchFormData = {
        name: branch.name,
        address: branch.address ?? '',
        contactEmail: branch.contactEmail ?? '',
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, branch]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_BRANCH_FORM);
      setInitialData(EMPTY_BRANCH_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(
    <K extends keyof BranchFormData>(field: K, value: BranchFormData[K]) => {
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

    const result = await save(form, tenantId, branch?.id);
    if (result.success) {
      showSuccess(isEditMode ? 'Branch updated successfully' : 'Branch created successfully');
      onSaved();
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, validate, save, tenantId, branch, showSuccess, showError, onSaved]);

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
            title={isEditMode ? 'Edit Branch' : 'New Branch'}
            onClose={handleClose}
          />

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-6">
              <FormSection title="Branch Information">
                <FormField label="Name" required error={errors.name}>
                  <TextInput
                    value={form.name}
                    onChange={(v) => updateField('name', v)}
                    placeholder="Branch name"
                    error={!!errors.name}
                    aria-label="Name"
                  />
                </FormField>
                <FormField label="Address" error={errors.address}>
                  <TextInput
                    value={form.address}
                    onChange={(v) => updateField('address', v)}
                    placeholder="Full address"
                    error={!!errors.address}
                    aria-label="Address"
                  />
                </FormField>
                <FormField label="Contact Email" error={errors.contactEmail}>
                  <EmailInput
                    value={form.contactEmail}
                    onChange={(v) => updateField('contactEmail', v)}
                    error={!!errors.contactEmail}
                    aria-label="Contact Email"
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
                {isEditMode ? 'Save' : 'Create Branch'}
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
