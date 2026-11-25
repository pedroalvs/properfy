import { useState, useEffect, useCallback, useRef } from 'react';
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
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useFormOptions } from '@/hooks/useFormOptions';
import { usePropertyDetail } from '../hooks/usePropertyDetail';
import { usePropertySave } from '../hooks/usePropertySave';
import { AddressNotVerifiedAlert } from '@/components/forms/AddressNotVerifiedAlert';
import { PROPERTY_TYPE_OPTIONS, STATE_OPTIONS, YES_NO_OPTIONS } from '../constants/form-options';
import type { PropertyFormData, PropertyFormErrors } from '../types';
import { EMPTY_PROPERTY_FORM } from '../types';
import type { AddressLookupSuggestion } from '@/lib/address';
import { buildAddressLabel } from '@/lib/address';
import { PropertyType, ADDRESS_LEGACY_UNVERIFIED_MESSAGE, ADDRESS_CHECK_DEFERRED_MESSAGE, type AddressNotVerifiedReason } from '@properfy/shared';

/** Address fields whose edit clears the on-save verification error (§5.3). */
const ADDRESS_FORM_FIELDS = new Set<keyof PropertyFormData>([
  'street',
  'addressLine2',
  'suburb',
  'postcode',
  'state',
  'country',
]);

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
  const isEditMode = !!propertyId;
  const { property, isLoading: isLoadingDetail } = usePropertyDetail(
    isEditMode ? propertyId : null,
  );

  // `/v1/branches` is tenant-scoped on the backend: a global role (AM/OP) that
  // sends no `tenantId` gets zero rows, and an empty option list leaves the
  // Branch select unable to render its own value — it falls back to the
  // placeholder even when `form.branchId` is set. Create → the tenant comes
  // from the parent form (nested appointment flow); edit → from the loaded
  // property. No `status` filter: it would hide a branch that went inactive
  // after the property was linked to it.
  const branchTenantId = tenantIdOverride ?? property?.tenantId;
  const { options: branchOptions } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'property-form-options', branchTenantId ?? ''],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
    { ...(branchTenantId ? { tenantId: branchTenantId } : {}) },
    // On the first edit render the property hasn't loaded, so its tenant is
    // still unknown — skip that request instead of firing an unscoped one.
    { enabled: !isEditMode || !!branchTenantId },
  );
  const { save, isSaving, validate } = usePropertySave();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<PropertyFormData>(EMPTY_PROPERTY_FORM);
  const [initialData, setInitialData] = useState<PropertyFormData>(EMPTY_PROPERTY_FORM);
  const [errors, setErrors] = useState<PropertyFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);
  // V-1: on-save address verification failure (422) + the manual-pin escape.
  const [addressError, setAddressError] = useState<AddressNotVerifiedReason | null>(null);
  const [showManualPin, setShowManualPin] = useState(false);
  const streetRef = useRef<HTMLInputElement>(null);
  // Legacy record whose stored address could not be located (edit only) — a
  // non-blocking yellow banner; editing non-address fields still saves.
  const showLegacyWarning = isEditMode && property?.geocodingStatus === 'FAILED';

  useEffect(() => {
    if (isEditMode && property) {
      const data: PropertyFormData = {
        type: property.type,
        apartmentNumber: property.apartmentNumber ?? '',
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
      setAddressError(null);
      setShowManualPin(false);
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
      setAddressError(null);
      setShowManualPin(false);
    }
  }, [open, isEditMode, initialBranchId]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  // A complete manual pin stops the address from being validated, so the
  // verification error disappears (reactive — polish b); clearing a coord returns it.
  const manualPinComplete =
    form.latitude.trim() !== '' &&
    form.longitude.trim() !== '' &&
    (form.latitude.trim() !== initialData.latitude.trim() ||
      form.longitude.trim() !== initialData.longitude.trim());
  const showAddressError = addressError !== null && !manualPinComplete;

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
      if (ADDRESS_FORM_FIELDS.has(field)) setAddressError(null);
    },
    [],
  );

  const applyAddressSuggestion = useCallback(
    (suggestion: AddressLookupSuggestion) => {
      // Suggestion coordinates are temporary (display-only) and are never posted.
      // In edit mode, picking a new address on a MANUAL property clears the
      // coordinate fields so the save unlocks it (null/null) and the backend
      // re-geocodes in permanent mode; for any other status the fields keep their
      // initial values (and so are not sent). In create mode the fields stay ''.
      const clearCoords = isEditMode && property?.geocodingStatus === 'MANUAL';
      setForm((prev) => ({
        ...prev,
        street: suggestion.street,
        suburb: suggestion.suburb,
        postcode: suggestion.postcode,
        state: suggestion.state,
        country: suggestion.country,
        ...(clearCoords ? { latitude: '', longitude: '' } : {}),
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
      setAddressError(null);
    },
    [isEditMode, property?.geocodingStatus],
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
    const result = await save(form, propertyId ?? undefined, tenantIdOverride, {
      initial: initialData,
      geocodingStatus: property?.geocodingStatus,
    });
    if (result.success) {
      const createMsg =
        result.geocodingStatus === 'PENDING'
          ? `Property created. ${ADDRESS_CHECK_DEFERRED_MESSAGE}`
          : 'Property created successfully';
      showSuccess(isEditMode ? 'Property updated successfully' : createMsg);
      if (!isEditMode && result.id) {
        onCreated?.(result.id);
      }
      onSaved();
    } else if (result.addressNotVerified) {
      // V-1: keep the drawer open, mark the fields, show the reason + manual escape.
      setAddressError(result.addressNotVerified);
      streetRef.current?.focus();
    } else {
      if (result.fieldErrors) {
        setErrors((prev) => ({ ...prev, ...result.fieldErrors }));
      }
      if (result.error || !result.fieldErrors) {
        showError(result.error ?? 'Failed to save');
      }
    }
  }, [isEditMode, form, initialData, property?.geocodingStatus, validate, save, propertyId, tenantIdOverride, showSuccess, showError, onSaved, onCreated]);

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
                    {isEditMode && (
                      <FormField label="Property Code" hint="Generated automatically.">
                        <TextInput
                          value={property?.propertyCode ?? ''}
                          onChange={() => {}}
                          disabled
                          aria-label="Property Code"
                        />
                      </FormField>
                    )}
                    <FormField label="Type" required error={errors.type}>
                      <SelectInput
                        value={form.type}
                        onChange={(v) => updateField('type', v)}
                        options={PROPERTY_TYPE_OPTIONS}
                        placeholder="Select type"
                        aria-label="Type"
                      />
                    </FormField>
                    {form.type === PropertyType.APARTMENT && (
                      <FormField label="Apartment" error={errors.apartmentNumber}>
                        <TextInput
                          value={form.apartmentNumber}
                          onChange={(v) => updateField('apartmentNumber', v)}
                          placeholder="e.g. Apt 12B"
                          aria-label="Apartment"
                        />
                      </FormField>
                    )}
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
                    {showLegacyWarning && !addressError && (
                      <div className="md:col-span-2">
                        <InfoBanner variant="warning">{ADDRESS_LEGACY_UNVERIFIED_MESSAGE}</InfoBanner>
                      </div>
                    )}
                    {addressError && !manualPinComplete && (
                      <div className="md:col-span-2">
                        <AddressNotVerifiedAlert
                          reason={addressError}
                          onSetManual={isEditMode ? undefined : () => setShowManualPin(true)}
                        />
                      </div>
                    )}
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
                        ref={streetRef}
                        value={form.street}
                        onChange={(v) => updateField('street', v)}
                        error={!!errors.street || showAddressError}
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
                        error={!!errors.suburb || showAddressError}
                        aria-label="Suburb"
                      />
                    </FormField>
                    <FormField label="Postcode" required error={errors.postcode}>
                      <TextInput
                        value={form.postcode}
                        onChange={(v) => updateField('postcode', v)}
                        error={!!errors.postcode || showAddressError}
                        aria-label="Postcode"
                      />
                    </FormField>
                    <FormField label="State" required error={errors.state}>
                      <SelectInput
                        value={form.state}
                        onChange={(v) => updateField('state', v)}
                        options={STATE_OPTIONS}
                        placeholder="Select state"
                        error={!!errors.state || showAddressError}
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

                  {(isEditMode || showManualPin) && (
                    <FormSection title="Coordinates" columns={2}>
                      <FormField label="Latitude" error={errors.latitude}>
                        <TextInput
                          value={form.latitude}
                          onChange={(v) => updateField('latitude', v)}
                          placeholder="-33.8688"
                          error={!!errors.latitude}
                          aria-label="Latitude"
                        />
                      </FormField>
                      <FormField label="Longitude" error={errors.longitude}>
                        <TextInput
                          value={form.longitude}
                          onChange={(v) => updateField('longitude', v)}
                          placeholder="151.2093"
                          error={!!errors.longitude}
                          aria-label="Longitude"
                        />
                      </FormField>
                      <p className="text-sm text-text-muted md:col-span-2">
                        {isEditMode
                          ? 'Optional. Manually override geocoded coordinates.'
                          : "Use only when the address can't be located. The address text is kept as typed and the location is marked as set manually."}
                      </p>
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
