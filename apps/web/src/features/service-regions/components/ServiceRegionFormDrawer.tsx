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
import { Checkbox } from '@/components/forms/Checkbox';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useServiceRegionDetail } from '../hooks/useServiceRegionDetail';
import { useServiceRegionSave } from '../hooks/useServiceRegionSave';
import { useSuburbList } from '../hooks/useSuburbList';
import { useStateOptions } from '../hooks/useStateOptions';
import { useCityOptions } from '../hooks/useCityOptions';
import type { ServiceRegionFormData, ServiceRegionFormErrors } from '../types';
import { EMPTY_SERVICE_REGION_FORM } from '../types';

const COUNTRY_OPTIONS = [
  { value: 'AU', label: 'Australia' },
  { value: 'BR', label: 'Brazil' },
];

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

interface ServiceRegionFormDrawerProps {
  open: boolean;
  onClose: () => void;
  regionId?: string | null;
  onSaved: () => void;
}

export function ServiceRegionFormDrawer({
  open,
  onClose,
  regionId,
  onSaved,
}: ServiceRegionFormDrawerProps) {
  const isEditMode = !!regionId;
  const { serviceRegion, isLoading: isLoadingDetail } = useServiceRegionDetail(
    isEditMode ? regionId : null,
  );
  const { save, isSaving, validate } = useServiceRegionSave();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<ServiceRegionFormData>(EMPTY_SERVICE_REGION_FORM);
  const [initialData, setInitialData] = useState<ServiceRegionFormData>(EMPTY_SERVICE_REGION_FORM);
  const [errors, setErrors] = useState<ServiceRegionFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  // Cascading data hooks
  const { options: stateOptions, isLoading: isLoadingStates } = useStateOptions(form.country);
  const { options: cityOptions, isLoading: isLoadingCities } = useCityOptions(form.country, form.state);
  const { suburbs, isLoading: isLoadingSuburbs } = useSuburbList(form.country, form.state, form.city);

  useEffect(() => {
    if (isEditMode && serviceRegion) {
      // Derive the city from the first suburb (all suburbs in a region share the same geography filtering context)
      const firstSuburb = serviceRegion.suburbs?.[0];
      const data: ServiceRegionFormData = {
        name: serviceRegion.name,
        country: serviceRegion.country,
        state: serviceRegion.state,
        city: firstSuburb?.city ?? '',
        suburbIds: serviceRegion.suburbs?.map((s) => s.id) ?? [],
        status: serviceRegion.status,
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, serviceRegion]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_SERVICE_REGION_FORM);
      setInitialData(EMPTY_SERVICE_REGION_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(
    <K extends keyof ServiceRegionFormData>(field: K, value: ServiceRegionFormData[K]) => {
      setForm((prev) => {
        const next = { ...prev, [field]: value };

        // Cascading resets
        if (field === 'country') {
          next.state = '';
          next.city = '';
          next.suburbIds = [];
        } else if (field === 'state') {
          next.city = '';
          next.suburbIds = [];
        } else if (field === 'city') {
          next.suburbIds = [];
        }

        return next;
      });
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

  const toggleSuburb = useCallback((suburbId: string, checked: boolean) => {
    setForm((prev) => {
      const next = checked
        ? Array.from(new Set([...prev.suburbIds, suburbId]))
        : prev.suburbIds.filter((id) => id !== suburbId);
      return { ...prev, suburbIds: next };
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const result = await save(form, regionId ?? undefined);
    if (result.success) {
      showSuccess(isEditMode ? 'Service region updated successfully' : 'Service region created successfully');
      onSaved();
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, validate, save, regionId, showSuccess, showError, onSaved]);

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
            title={isEditMode ? 'Edit Service Region' : 'New Service Region'}
            onClose={handleClose}
          />

          {isEditMode && isLoadingDetail ? (
            <div className="flex-1 px-6 py-4">
              <LoadingState rows={5} />
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="flex flex-col gap-6">
                  <FormSection title="Region Details" columns={2}>
                    <FormField label="Name" required error={errors.name}>
                      <TextInput
                        value={form.name}
                        onChange={(v) => updateField('name', v)}
                        placeholder="e.g. Sydney CBD & Surrounds"
                        error={!!errors.name}
                        aria-label="Name"
                      />
                    </FormField>
                    <FormField label="Country" required error={errors.country}>
                      <SelectInput
                        value={form.country}
                        onChange={(v) => updateField('country', v)}
                        options={COUNTRY_OPTIONS}
                        placeholder="Select country"
                        error={!!errors.country}
                        aria-label="Country"
                      />
                    </FormField>
                    <FormField label="State" required error={errors.state}>
                      <SelectInput
                        value={form.state}
                        onChange={(v) => updateField('state', v)}
                        options={stateOptions}
                        placeholder={isLoadingStates ? 'Loading states...' : 'Select state'}
                        disabled={!form.country}
                        error={!!errors.state}
                        aria-label="State"
                      />
                    </FormField>
                    {isEditMode && (
                      <FormField label="Status">
                        <SelectInput
                          value={form.status}
                          onChange={(v) => updateField('status', v)}
                          options={STATUS_OPTIONS}
                          aria-label="Status"
                        />
                      </FormField>
                    )}
                  </FormSection>

                  <FormSection title="Suburbs">
                    <div className="flex flex-col gap-4">
                      <FormField label="City" required error={errors.city}>
                        <SelectInput
                          value={form.city}
                          onChange={(v) => updateField('city', v)}
                          options={cityOptions}
                          placeholder={isLoadingCities ? 'Loading cities...' : 'Select city'}
                          disabled={!form.country || !form.state}
                          error={!!errors.city}
                          aria-label="City"
                        />
                      </FormField>

                      <FormField label={`Suburbs (${form.suburbIds.length} selected)`} error={errors.suburbIds}>
                        <div className="flex flex-col gap-3 rounded border border-black/10 px-3 py-3">
                          {!form.country || !form.state || !form.city ? (
                            <p className="text-sm text-text-muted">
                              Select country, state and city to view available suburbs.
                            </p>
                          ) : (
                            <div className="max-h-60 overflow-y-auto">
                              {suburbs.length > 0 ? (
                                <div className="grid gap-2">
                                  {suburbs.map((suburb) => (
                                    <Checkbox
                                      key={suburb.id}
                                      label={`${suburb.name} ${suburb.postcode ? `- ${suburb.postcode}` : ''}`}
                                      checked={form.suburbIds.includes(suburb.id)}
                                      onChange={(checked) => toggleSuburb(suburb.id, checked)}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-text-muted">
                                  {isLoadingSuburbs ? 'Loading suburbs...' : 'No suburbs found for this city.'}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </FormField>
                    </div>
                  </FormSection>
                </div>
              </div>

              <div className="border-t border-black/10 px-6 py-4">
                <FormActions>
                  <Button variant="secondary" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                    {isEditMode ? 'Save' : 'Create Service Region'}
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
