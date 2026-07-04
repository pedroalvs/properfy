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
import { AddressLookupInput } from '@/components/forms/AddressLookupInput';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useFormOptions } from '@/hooks/useFormOptions';
import { usePropertyDetail } from '../hooks/usePropertyDetail';
import { usePropertySave } from '../hooks/usePropertySave';
import { PROPERTY_TYPE_OPTIONS, STATE_OPTIONS } from '../constants/form-options';
import type { PropertyFormData, PropertyFormErrors } from '../types';
import { EMPTY_PROPERTY_FORM } from '../types';
import type { AddressLookupSuggestion } from '@/lib/address';
import { buildAddressLabel } from '@/lib/address';

const YES_NO_OPTIONS = [
  { label: 'Yes', value: 'true' },
  { label: 'No', value: 'false' },
];

interface PropertyFormDrawerProps {
  open: boolean;
  onClose: () => void;
  propertyId?: string | null;
  onSaved: () => void;
  tenantIdOverride?: string;
  initialBranchId?: string;
  lockBranch?: boolean;
  onCreated?: (propertyId: string) => void;
}

export function PropertyFormDrawer({
  open,
  onClose,
  propertyId,
  onSaved,
  tenantIdOverride,
  initialBranchId,
  lockBranch = false,
  onCreated,
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
        privateAreaM2: property.privateAreaM2 != null ? String(property.privateAreaM2) : '',
        totalAreaM2: property.totalAreaM2 != null ? String(property.totalAreaM2) : '',
        furnished: property.furnished == null ? '' : property.furnished ? 'true' : 'false',
        linenProvided:
          property.linenProvided == null ? '' : property.linenProvided ? 'true' : 'false',
        rentAmount: property.rentAmount != null ? String(property.rentAmount) : '',
        notes: property.notes ?? '',
        latitude: property.latitude != null ? String(property.latitude) : '',
        longitude: property.longitude != null ? String(property.longitude) : '',
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, property]);

  useEffect(() => {
    if (open && !isEditMode) {
      const nextForm = {
        ...EMPTY_PROPERTY_FORM,
        branchId: initialBranchId ?? '',
      };
      setForm(nextForm);
      setInitialData(nextForm);
      setErrors({});
    }
  }, [open, isEditMode, initialBranchId]);

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

  const applyAddressSuggestion = useCallback(
    (suggestion: AddressLookupSuggestion) => {
      setForm((prev) => ({
        ...prev,
        street: suggestion.street,
        suburb: suggestion.suburb,
        postcode: suggestion.postcode,
        state: suggestion.state,
        country: suggestion.country,
      }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next.street;
        delete next.suburb;
        delete next.postcode;
        delete next.state;
        delete next.country;
        return next;
      });
    },
    [],
  );

  const clearAddressSelection = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      street: '',
      suburb: '',
      postcode: '',
      state: '',
      country: 'AU',
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    const mode = isEditMode ? 'edit' : 'create';
    const validationErrors = validate(form, mode);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    const result = await save(form, propertyId ?? undefined, tenantIdOverride);
    if (result.success) {
      showSuccess(isEditMode ? 'Property updated successfully' : 'Property created successfully');
      if (!isEditMode && result.id) {
        onCreated?.(result.id);
      }
      onSaved();
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, validate, save, propertyId, tenantIdOverride, showSuccess, showError, onSaved, onCreated]);

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
                        disabled={lockBranch}
                        aria-label="Branch"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Address" columns={2}>
                    <FormField
                      label="Verified Address"
                      required
                      hint="Search a verified address, then adjust the structured fields if needed."
                      className="md:col-span-2"
                    >
                      <AddressLookupInput
                        label="Verified Address"
                        valueLabel={buildAddressLabel({
                          street: form.street,
                          suburb: form.suburb,
                          postcode: form.postcode,
                          state: form.state,
                          country: form.country,
                        }) ?? ''}
                        onSelect={applyAddressSuggestion}
                        onClear={clearAddressSelection}
                        placeholder="Search verified address"
                        ariaLabel="Verified Address"
                      />
                    </FormField>
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
                      <SelectInput
                        value={form.state}
                        onChange={(v) => updateField('state', v)}
                        options={STATE_OPTIONS}
                        placeholder="Select state"
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

                  <FormSection title="Details" columns={2}>
                    <FormField label="Private Area (m²)" error={errors.privateAreaM2}>
                      <TextInput
                        value={form.privateAreaM2}
                        onChange={(v) => updateField('privateAreaM2', v)}
                        placeholder="85.5"
                        aria-label="Private Area (m²)"
                      />
                    </FormField>
                    <FormField label="Total Area (m²)" error={errors.totalAreaM2}>
                      <TextInput
                        value={form.totalAreaM2}
                        onChange={(v) => updateField('totalAreaM2', v)}
                        placeholder="120"
                        aria-label="Total Area (m²)"
                      />
                    </FormField>
                    <FormField label="Furnished" error={errors.furnished}>
                      <SelectInput
                        value={form.furnished}
                        onChange={(v) => updateField('furnished', v as '' | 'true' | 'false')}
                        options={YES_NO_OPTIONS}
                        placeholder="Not specified"
                        aria-label="Furnished"
                      />
                    </FormField>
                    <FormField label="Linen Provided" error={errors.linenProvided}>
                      <SelectInput
                        value={form.linenProvided}
                        onChange={(v) => updateField('linenProvided', v as '' | 'true' | 'false')}
                        options={YES_NO_OPTIONS}
                        placeholder="Not specified"
                        aria-label="Linen Provided"
                      />
                    </FormField>
                    <FormField label="Rent Amount" error={errors.rentAmount}>
                      <TextInput
                        value={form.rentAmount}
                        onChange={(v) => updateField('rentAmount', v)}
                        placeholder="2500.00"
                        aria-label="Rent Amount"
                      />
                    </FormField>
                  </FormSection>

                  {isEditMode && (
                    <FormSection title="Coordinates" columns={2}>
                      <FormField
                        label="Latitude"
                        hint="Optional. Manually override geocoded coordinates."
                        error={errors.latitude}
                      >
                        <TextInput
                          value={form.latitude}
                          onChange={(v) => updateField('latitude', v)}
                          placeholder="-33.8688"
                          aria-label="Latitude"
                        />
                      </FormField>
                      <FormField
                        label="Longitude"
                        error={errors.longitude}
                      >
                        <TextInput
                          value={form.longitude}
                          onChange={(v) => updateField('longitude', v)}
                          placeholder="151.2093"
                          aria-label="Longitude"
                        />
                      </FormField>
                    </FormSection>
                  )}

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
