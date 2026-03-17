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
import { useSnackbar } from '@/hooks/useSnackbar';
import { useInspectorDetail } from '../hooks/useInspectorDetail';
import { useInspectorSave } from '../hooks/useInspectorSave';
import { INSPECTOR_STATUS_OPTIONS } from '../constants/form-options';
import type { InspectorFormData, InspectorFormErrors } from '../types';
import { EMPTY_INSPECTOR_FORM } from '../types';

interface InspectorFormDrawerProps {
  open: boolean;
  onClose: () => void;
  inspectorId?: string | null;
  onSaved: () => void;
}

export function InspectorFormDrawer({
  open,
  onClose,
  inspectorId,
  onSaved,
}: InspectorFormDrawerProps) {
  const isEditMode = !!inspectorId;
  const { inspector, isLoading: isLoadingDetail } = useInspectorDetail(
    isEditMode ? inspectorId : null,
  );
  const { save, isSaving, validate } = useInspectorSave();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<InspectorFormData>(EMPTY_INSPECTOR_FORM);
  const [initialData, setInitialData] = useState<InspectorFormData>(EMPTY_INSPECTOR_FORM);
  const [errors, setErrors] = useState<InspectorFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isEditMode && inspector) {
      const data: InspectorFormData = {
        name: inspector.name,
        email: inspector.email,
        phone: inspector.phone ?? '',
        document: inspector.document ?? '',
        status: inspector.status,
        regions: inspector.regions.join(', '),
        serviceTypes: inspector.serviceTypes.join(', '),
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, inspector]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_INSPECTOR_FORM);
      setInitialData(EMPTY_INSPECTOR_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(
    <K extends keyof InspectorFormData>(field: K, value: InspectorFormData[K]) => {
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
    const result = await save(form, inspectorId ?? undefined);
    if (result.success) {
      showSuccess(isEditMode ? 'Inspector updated successfully' : 'Inspector created successfully');
      onSaved();
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, validate, save, inspectorId, showSuccess, showError, onSaved]);

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
            title={isEditMode ? 'Edit Inspector' : 'New Inspector'}
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
                    <FormField label="Document" error={errors.document}>
                      <TextInput
                        value={form.document}
                        onChange={(v) => updateField('document', v)}
                        aria-label="Document"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Coverage" columns={2}>
                    <FormField label="Regions" error={errors.regions}>
                      <Textarea
                        value={form.regions}
                        onChange={(v) => updateField('regions', v)}
                        rows={2}
                        placeholder="Comma-separated"
                        aria-label="Regions"
                      />
                    </FormField>
                    <FormField label="Service Types" error={errors.serviceTypes}>
                      <Textarea
                        value={form.serviceTypes}
                        onChange={(v) => updateField('serviceTypes', v)}
                        rows={2}
                        placeholder="Comma-separated"
                        aria-label="Service Types"
                      />
                    </FormField>
                  </FormSection>

                  {isEditMode && (
                    <FormSection title="Status">
                      <FormField label="Status" error={errors.status}>
                        <SelectInput
                          value={form.status}
                          onChange={(v) => updateField('status', v)}
                          options={INSPECTOR_STATUS_OPTIONS}
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
                    {isEditMode ? 'Save' : 'Create Inspector'}
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
