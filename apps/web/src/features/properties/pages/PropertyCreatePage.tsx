import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserRole } from '@properfy/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { TextInput } from '@/components/forms/TextInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { Textarea } from '@/components/forms/Textarea';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useFormOptions } from '@/hooks/useFormOptions';
import { useAuth } from '@/hooks/useAuth';
import { usePropertySave } from '../hooks/usePropertySave';
import { PROPERTY_TYPE_OPTIONS, STATE_OPTIONS } from '../constants/form-options';
import type { PropertyFormData, PropertyFormErrors } from '../types';
import { EMPTY_PROPERTY_FORM } from '../types';

export function PropertyCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showSuccess, showError } = useSnackbar();
  const { save, isSaving, validate } = usePropertySave();
  const isGlobalRole = user?.role === UserRole.AM || user?.role === UserRole.OP;
  const initialTenantId = typeof location.state === 'object'
    && location.state
    && 'tenantId' in location.state
    && typeof location.state.tenantId === 'string'
      ? location.state.tenantId
      : '';
  const [selectedTenantId, setSelectedTenantId] = useState(initialTenantId);
  const effectiveTenantId = isGlobalRole ? selectedTenantId : user?.tenantId ?? undefined;
  const requiresTenantSelection = isGlobalRole && !selectedTenantId;

  const { options: tenantOptions } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'property-create'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
    undefined,
    { enabled: isGlobalRole },
  );

  const { options: branchOptions } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'property-create', effectiveTenantId ?? ''],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
    effectiveTenantId ? { tenantId: effectiveTenantId } : undefined,
    { enabled: !isGlobalRole || !!effectiveTenantId },
  );

  const [form, setForm] = useState<PropertyFormData>(EMPTY_PROPERTY_FORM);
  const [initialData] = useState<PropertyFormData>(EMPTY_PROPERTY_FORM);
  const [errors, setErrors] = useState<PropertyFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!isGlobalRole) return;
    setForm((prev) => ({ ...prev, branchId: '' }));
  }, [isGlobalRole, selectedTenantId]);

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
    const validationErrors = validate(form, 'create');
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      if (requiresTenantSelection) {
        showError('Select an agency before creating a property');
      }
      return;
    }

    if (requiresTenantSelection) {
      showError('Select an agency before creating a property');
      return;
    }

    const result = await save(form, undefined, effectiveTenantId);
    if (result.success) {
      showSuccess('Property created. Geocoding in progress.');
      if (result.id) {
        navigate(`/properties/${result.id}`);
      } else {
        navigate('/properties');
      }
    } else {
      showError(result.error ?? 'Failed to create property');
    }
  }, [effectiveTenantId, form, navigate, requiresTenantSelection, save, showError, showSuccess, validate]);

  const handleBack = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      navigate(-1);
    }
  }, [isDirty, navigate]);

  const forceBack = useCallback(() => {
    setShowConfirm(false);
    navigate(-1);
  }, [navigate]);

  const cancelDiscard = useCallback(() => {
    setShowConfirm(false);
  }, []);

  return (
    <>
      <PageHeader
        title="New Property"
        secondaryActions={[
          {
            label: 'Back',
            icon: 'mdi-arrow-left',
            onClick: handleBack,
          },
        ]}
      />

      <div className="mx-auto max-w-[640px]">
        <div className="rounded bg-card-bg p-6 shadow-sm">
          <div className="flex flex-col gap-6">
            {isGlobalRole && (
              <FormSection title="Agency Context">
                <FormField label="Agency" required>
                  <SelectInput
                    value={selectedTenantId}
                    onChange={setSelectedTenantId}
                    options={tenantOptions}
                    placeholder="Select agency"
                    aria-label="Agency"
                  />
                </FormField>
                {requiresTenantSelection && (
                  <p className="text-sm text-text-muted">
                    Select an agency before creating a property.
                  </p>
                )}
              </FormSection>
            )}
            <FormSection title="Identification" columns={2}>
              <FormField label="Property Code" required error={errors.propertyCode}>
                <TextInput
                  value={form.propertyCode}
                  onChange={(v) => updateField('propertyCode', v)}
                  placeholder="e.g. PROP-001"
                  error={!!errors.propertyCode}
                  aria-label="Property Code"
                />
              </FormField>
              <FormField label="Type" required error={errors.type}>
                <SelectInput
                  value={form.type}
                  onChange={(v) => updateField('type', v)}
                  options={PROPERTY_TYPE_OPTIONS}
                  placeholder="Select type"
                  error={!!errors.type}
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
              {isGlobalRole && selectedTenantId && branchOptions.length === 0 && (
                <p className="text-sm text-text-muted">
                  No branches available for the selected agency.
                </p>
              )}
            </FormSection>

            <FormSection title="Address" columns={2}>
              <FormField label="Street" required error={errors.street}>
                <TextInput
                  value={form.street}
                  onChange={(v) => updateField('street', v)}
                  error={!!errors.street}
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
                  error={!!errors.suburb}
                  aria-label="Suburb"
                />
              </FormField>
              <FormField label="Postcode" required error={errors.postcode}>
                <TextInput
                  value={form.postcode}
                  onChange={(v) => updateField('postcode', v)}
                  error={!!errors.postcode}
                  aria-label="Postcode"
                />
              </FormField>
              <FormField label="State" required error={errors.state}>
                <SelectInput
                  value={form.state}
                  onChange={(v) => updateField('state', v)}
                  options={STATE_OPTIONS}
                  placeholder="Select state"
                  error={!!errors.state}
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

          <div className="mt-6">
            <FormActions>
              <Button variant="secondary" onClick={handleBack}>
                Cancel
              </Button>
              <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                Create Property
              </Button>
            </FormActions>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showConfirm}
        title="Discard changes?"
        message="You have unsaved changes. Do you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Continue editing"
        variant="warning"
        onConfirm={forceBack}
        onClose={cancelDiscard}
      />
    </>
  );
}
