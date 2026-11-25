import { useState, useEffect, useCallback, useRef } from 'react';
import type { AddressNotVerifiedReason } from '@properfy/shared';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { TextInput } from '@/components/forms/TextInput';
import { EmailInput } from '@/components/forms/EmailInput';
import { AddressLookupInput } from '@/components/forms/AddressLookupInput';
import { useSnackbar } from '@/hooks/useSnackbar';
import { formatAddressLabel, toAddressSuggestion, type AddressLookupSuggestion } from '@/lib/address';
import { AddressNotVerifiedAlert } from '@/components/forms/AddressNotVerifiedAlert';
import { useBranchSave } from '../hooks/useBranchSave';
import { useBranchById } from '../hooks/useBranchById';
import type { Branch, BranchFormData, BranchFormErrors } from '../types';
import { EMPTY_BRANCH_FORM } from '../types';

/**
 * O-9: whether the address section was actually edited vs the loaded value.
 * Compares only the fields the save sends, so a re-filled-but-unchanged legacy
 * address counts as unchanged and the save omits it (no backend re-geocode).
 */
function sameFormAddress(a: AddressLookupSuggestion | null, b: AddressLookupSuggestion | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.street === b.street &&
    (a.number ?? '') === (b.number ?? '') &&
    a.suburb === b.suburb &&
    a.postcode === b.postcode &&
    a.state === b.state &&
    a.country === b.country
  );
}

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
  const { data: freshBranch } = useBranchById(tenantId, isEditMode ? (branch?.id ?? null) : null);

  const [form, setForm] = useState<BranchFormData>(EMPTY_BRANCH_FORM);
  const [initialData, setInitialData] = useState<BranchFormData>(EMPTY_BRANCH_FORM);
  const [errors, setErrors] = useState<BranchFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);
  // V-2: on-save address verification failure (422). No manual pin for branches.
  const [addressError, setAddressError] = useState<AddressNotVerifiedReason | null>(null);
  const streetRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const source = freshBranch ?? branch;
    if (isEditMode && source) {
      const data: BranchFormData = {
        name: source.name,
        address: toAddressSuggestion(source.addressJson),
        contactEmail: source.contactEmail ?? '',
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
      setAddressError(null);
    }
  }, [isEditMode, freshBranch, branch]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_BRANCH_FORM);
      setInitialData(EMPTY_BRANCH_FORM);
      setErrors({});
      setAddressError(null);
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);
  // V-2: branches have no manual-pin escape, so the mark is simply "there is an
  // on-save address error" (mirrors V-1's showAddressError without the pin term).
  const showAddressError = addressError !== null;

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
      if (field === 'address') setAddressError(null);
    },
    [],
  );

  const updateAddressField = useCallback(
    (field: 'street' | 'number' | 'suburb' | 'postcode' | 'state' | 'country', value: string) => {
      setAddressError(null);
      setForm((prev) => {
        const nextAddress = {
          ...(prev.address ?? {
            formattedAddress: '',
            street: '',
            number: '',
            suburb: '',
            postcode: '',
            state: '',
            country: 'AU',
            latitude: 0,
            longitude: 0,
            provider: 'MAPBOX' as const,
          }),
          [field]: value,
        };

        return {
          ...prev,
          address: {
            ...nextAddress,
            // Reuse PR-09's formatAddressLabel so the rebuilt label keeps the house
            // number (it prepends `number` to the street). Clear the stale
            // formattedAddress first so the helper recomputes from the parts.
            formattedAddress:
              formatAddressLabel({ ...nextAddress, formattedAddress: '' }) ??
              nextAddress.formattedAddress,
          },
        };
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

    // O-9: on an edit, only send the address when it actually changed. A re-sent
    // legacy address (e.g. one stored without a country) would otherwise differ
    // from the stored value (backend defaults country to 'AU') and re-geocode.
    const omitAddress = isEditMode && sameFormAddress(form.address, initialData.address);
    const result = await save(form, tenantId, branch?.id, { omitAddress });
    if (result.success) {
      showSuccess(isEditMode ? 'Branch updated successfully' : 'Branch created successfully');
      onSaved();
    } else if (result.addressNotVerified) {
      // V-2: keep the drawer open, mark the address fields, show the reason, focus Street.
      setAddressError(result.addressNotVerified);
      streetRef.current?.focus();
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, initialData, validate, save, tenantId, branch, showSuccess, showError, onSaved]);

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
                {addressError && (
                  <AddressNotVerifiedAlert reason={addressError} />
                )}
                <FormField label="Address" error={errors.address}>
                  <AddressLookupInput
                    label="Address"
                    valueLabel={formatAddressLabel(form.address) ?? ''}
                    onSelect={(value) => updateField('address', value)}
                    onClear={() => updateField('address', null)}
                    placeholder="Search verified address"
                    ariaLabel="Address"
                  />
                </FormField>
                {form.address && (
                  <>
                    <FormField label="Street">
                      <TextInput
                        ref={streetRef}
                        value={form.address.street}
                        onChange={(v) => updateAddressField('street', v)}
                        error={showAddressError}
                        aria-label="Branch Street"
                      />
                    </FormField>
                    <FormField label="Number">
                      <TextInput
                        value={form.address.number ?? ''}
                        onChange={(v) => updateAddressField('number', v)}
                        error={showAddressError}
                        aria-label="Branch Number"
                      />
                    </FormField>
                    <FormField label="Suburb">
                      <TextInput
                        value={form.address.suburb}
                        onChange={(v) => updateAddressField('suburb', v)}
                        error={showAddressError}
                        aria-label="Branch Suburb"
                      />
                    </FormField>
                    <FormField label="Postcode">
                      <TextInput
                        value={form.address.postcode}
                        onChange={(v) => updateAddressField('postcode', v)}
                        error={showAddressError}
                        aria-label="Branch Postcode"
                      />
                    </FormField>
                    <FormField label="State">
                      <TextInput
                        value={form.address.state}
                        onChange={(v) => updateAddressField('state', v)}
                        error={showAddressError}
                        aria-label="Branch State"
                      />
                    </FormField>
                    <FormField label="Country">
                      <TextInput
                        value={form.address.country}
                        onChange={(v) => updateAddressField('country', v)}
                        aria-label="Branch Country"
                      />
                    </FormField>
                  </>
                )}
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
