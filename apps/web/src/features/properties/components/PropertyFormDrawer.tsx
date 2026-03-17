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
import { useFormOptions } from '@/hooks/useFormOptions';
import { usePropertyDetail } from '../hooks/usePropertyDetail';
import { usePropertySave } from '../hooks/usePropertySave';
import { PROPERTY_TYPE_OPTIONS } from '../constants/form-options';
import type { PropertyFormData, PropertyFormErrors } from '../types';
import { EMPTY_PROPERTY_FORM } from '../types';

interface PropertyFormDrawerProps {
  open: boolean;
  onClose: () => void;
  propertyId?: string | null;
  onSaved: () => void;
}

export function PropertyFormDrawer({
  open,
  onClose,
  propertyId,
  onSaved,
}: PropertyFormDrawerProps) {
  const { options: branchOptions } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'form-options'],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
  );

  const isEditMode = !!propertyId;
  const { property, isLoading: isLoadingDetail } = usePropertyDetail(
    isEditMode ? propertyId : null,
  );
  const { save, isSaving, validate } = usePropertySave();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<PropertyFormData>(EMPTY_PROPERTY_FORM);
  const [initialData, setInitialData] = useState<PropertyFormData>(EMPTY_PROPERTY_FORM);
  const [errors, setErrors] = useState<PropertyFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isEditMode && property) {
      const data: PropertyFormData = {
        propertyCode: property.propertyCode,
        type: property.type,
        branchId: property.branchId ?? '',
        street: property.street,
        addressLine2: property.addressLine2 ?? '',
        suburb: property.suburb,
        postcode: property.postcode,
        state: property.state,
        country: property.country,
        notes: property.notes ?? '',
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, property]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_PROPERTY_FORM);
      setInitialData(EMPTY_PROPERTY_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(
    <K extends keyof PropertyFormData>(field: K, value: PropertyFormData[K]) => {
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
    const result = await save(form, propertyId ?? undefined);
    if (result.success) {
      showSuccess(isEditMode ? 'Property updated successfully' : 'Property created successfully');
      onSaved();
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, validate, save, propertyId, showSuccess, showError, onSaved]);

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
            title={isEditMode ? 'Edit Property' : 'New Property'}
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
                  <FormSection title="Identification" columns={2}>
                    <FormField label="Property Code" required error={errors.propertyCode}>
                      <TextInput
                        value={form.propertyCode}
                        onChange={(v) => updateField('propertyCode', v)}
                        disabled={isEditMode}
                        aria-label="Property Code"
                      />
                    </FormField>
                    <FormField label="Type" required error={errors.type}>
                      <SelectInput
                        value={form.type}
                        onChange={(v) => updateField('type', v)}
                        options={PROPERTY_TYPE_OPTIONS}
                        placeholder="Select type"
                        aria-label="Type"
                      />
                    </FormField>
                    <FormField label="Branch" error={errors.branchId}>
                      <SelectInput
                        value={form.branchId}
                        onChange={(v) => updateField('branchId', v)}
                        options={branchOptions}
                        placeholder="Select branch"
                        aria-label="Branch"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Address" columns={2}>
                    <FormField label="Street" required error={errors.street}>
                      <TextInput
                        value={form.street}
                        onChange={(v) => updateField('street', v)}
                        aria-label="Street"
                      />
                    </FormField>
                    <FormField label="Address Line 2" error={errors.addressLine2}>
                      <TextInput
                        value={form.addressLine2}
                        onChange={(v) => updateField('addressLine2', v)}
                        aria-label="Address Line 2"
                      />
                    </FormField>
                    <FormField label="Suburb" required error={errors.suburb}>
                      <TextInput
                        value={form.suburb}
                        onChange={(v) => updateField('suburb', v)}
                        aria-label="Suburb"
                      />
                    </FormField>
                    <FormField label="Postcode" required error={errors.postcode}>
                      <TextInput
                        value={form.postcode}
                        onChange={(v) => updateField('postcode', v)}
                        aria-label="Postcode"
                      />
                    </FormField>
                    <FormField label="State" required error={errors.state}>
                      <TextInput
                        value={form.state}
                        onChange={(v) => updateField('state', v)}
                        aria-label="State"
                      />
                    </FormField>
                    <FormField label="Country" error={errors.country}>
                      <TextInput
                        value={form.country}
                        onChange={(v) => updateField('country', v)}
                        aria-label="Country"
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
                </div>
              </div>

              <div className="border-t border-black/10 px-6 py-4">
                <FormActions>
                  <Button variant="secondary" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                    {isEditMode ? 'Save' : 'Create Property'}
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
