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
import { AddressLookupInput } from '@/components/forms/AddressLookupInput';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useServiceRegionDetail } from '../hooks/useServiceRegionDetail';
import { useServiceRegionSave } from '../hooks/useServiceRegionSave';
import { useStateOptions } from '../hooks/useStateOptions';
import { useCityOptions } from '../hooks/useCityOptions';
import { api } from '@/services/api';
import type { AddressLookupSuggestion } from '@/lib/address';
import type { ServiceRegionFormData, ServiceRegionFormErrors, Suburb } from '../types';
import { EMPTY_SERVICE_REGION_FORM } from '../types';

const COUNTRY_OPTIONS = [
  { value: '', label: 'All countries' },
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
  const [addedSuburbs, setAddedSuburbs] = useState<Suburb[]>([]);
  const [isAddingSuburb, setIsAddingSuburb] = useState(false);

  // Geographic filters for narrowing address lookup suggestions
  const [filterCountry, setFilterCountry] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterCity, setFilterCity] = useState('');

  const { options: stateOptions, isLoading: isLoadingStates } = useStateOptions(filterCountry);
  const { options: cityOptions, isLoading: isLoadingCities } = useCityOptions(filterCountry, filterState);

  useEffect(() => {
    if (isEditMode && serviceRegion) {
      const data: ServiceRegionFormData = {
        name: serviceRegion.name,
        country: serviceRegion.country,
        state: serviceRegion.state,
        city: '',
        suburbIds: serviceRegion.suburbs?.map((s) => s.id) ?? [],
        status: serviceRegion.status,
      };
      setForm(data);
      setInitialData(data);
      setAddedSuburbs(serviceRegion.suburbs ?? []);
      setFilterCountry(serviceRegion.country);
      setFilterState(serviceRegion.state);
      setErrors({});
    }
  }, [isEditMode, serviceRegion]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_SERVICE_REGION_FORM);
      setInitialData(EMPTY_SERVICE_REGION_FORM);
      setAddedSuburbs([]);
      setFilterCountry('');
      setFilterState('');
      setFilterCity('');
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(
    <K extends keyof ServiceRegionFormData>(field: K, value: ServiceRegionFormData[K]) => {
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

  const handleCountryChange = useCallback((value: string) => {
    setFilterCountry(value);
    setFilterState('');
    setFilterCity('');
  }, []);

  const handleStateChange = useCallback((value: string) => {
    setFilterState(value);
    setFilterCity('');
  }, []);

  const handleAddressSelect = useCallback(async (suggestion: AddressLookupSuggestion) => {
    setIsAddingSuburb(true);
    try {
      const { data, error } = await api.POST('/v1/suburbs/resolve' as any, {
        body: {
          name: suggestion.suburb,
          city: suggestion.suburb,
          state: suggestion.state,
          country: suggestion.country,
          postcode: suggestion.postcode || null,
        } as any,
      });

      if (error) {
        showError('Failed to resolve suburb');
        return;
      }

      const resolved = (data as any)?.data;
      if (!resolved?.id) {
        showError('Failed to resolve suburb');
        return;
      }

      setForm((prev) => {
        const isFirstSuburb = prev.suburbIds.length === 0;
        const alreadyAdded = prev.suburbIds.includes(resolved.id);
        if (alreadyAdded) return prev;

        return {
          ...prev,
          country: isFirstSuburb ? suggestion.country : prev.country,
          state: isFirstSuburb ? suggestion.state : prev.state,
          suburbIds: [...prev.suburbIds, resolved.id],
        };
      });

      setAddedSuburbs((prev) => {
        if (prev.some((s) => s.id === resolved.id)) return prev;
        return [...prev, {
          id: resolved.id,
          name: resolved.name,
          city: resolved.city,
          state: resolved.state,
          country: resolved.country,
          postcode: resolved.postcode ?? null,
          status: resolved.status ?? 'ACTIVE',
        }];
      });

      // Auto-set filters from first suburb
      if (!filterCountry) setFilterCountry(suggestion.country);
      if (!filterState) setFilterState(suggestion.state);
    } finally {
      setIsAddingSuburb(false);
    }
  }, [showError, filterCountry, filterState]);

  const removeSuburb = useCallback((suburbId: string) => {
    setForm((prev) => ({
      ...prev,
      suburbIds: prev.suburbIds.filter((id) => id !== suburbId),
    }));
    setAddedSuburbs((prev) => prev.filter((s) => s.id !== suburbId));
  }, []);

  const handleSubmit = useCallback(async () => {
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const result = await save(form, regionId ?? undefined);
    if (result.success) {
      showSuccess(isEditMode ? 'Service region updated' : 'Service region created');
      onSaved();
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, validate, save, regionId, showSuccess, showError, onSaved]);

  const handleClose = useCallback(() => {
    if (isDirty) setShowConfirm(true);
    else onClose();
  }, [isDirty, onClose]);

  // Build address lookup context from filters for better suggestions
  const lookupCountry = filterCountry || undefined;

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
                      {/* Geographic filters to narrow search */}
                      <div className="grid grid-cols-3 gap-3">
                        <FormField label="Country">
                          <SelectInput
                            value={filterCountry}
                            onChange={handleCountryChange}
                            options={COUNTRY_OPTIONS}
                            aria-label="Filter by country"
                          />
                        </FormField>
                        <FormField label="State">
                          <SelectInput
                            value={filterState}
                            onChange={handleStateChange}
                            options={[
                              { value: '', label: filterCountry ? (isLoadingStates ? 'Loading...' : 'All states') : 'Select country first' },
                              ...stateOptions,
                            ]}
                            disabled={!filterCountry}
                            aria-label="Filter by state"
                          />
                        </FormField>
                        <FormField label="City">
                          <SelectInput
                            value={filterCity}
                            onChange={setFilterCity}
                            options={[
                              { value: '', label: filterState ? (isLoadingCities ? 'Loading...' : 'All cities') : 'Select state first' },
                              ...cityOptions,
                            ]}
                            disabled={!filterState}
                            aria-label="Filter by city"
                          />
                        </FormField>
                      </div>

                      <FormField label="Search and add suburbs" error={errors.suburbIds}>
                        <AddressLookupInput
                          label="Search suburb"
                          valueLabel=""
                          onSelect={handleAddressSelect}
                          onClear={() => {}}
                          country={lookupCountry}
                          placeholder={
                            filterCountry
                              ? `Search suburbs in ${filterCountry}${filterState ? ` / ${filterState}` : ''}${filterCity ? ` / ${filterCity}` : ''}...`
                              : 'Search suburb name...'
                          }
                          disabled={isAddingSuburb}
                          ariaLabel="Search suburb to add"
                        />
                        {isAddingSuburb && (
                          <p className="mt-1 text-xs text-text-muted">Adding suburb...</p>
                        )}
                      </FormField>

                      {/* Selected suburbs */}
                      <div className="rounded border border-black/10 px-3 py-3">
                        {addedSuburbs.length === 0 ? (
                          <p className="text-sm text-text-muted">
                            No suburbs added yet. Use the filters above to narrow your search, then add suburbs.
                          </p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                              {addedSuburbs.length} suburb{addedSuburbs.length !== 1 ? 's' : ''} selected
                            </p>
                            <div className="max-h-64 overflow-y-auto">
                              <div className="flex flex-wrap gap-2">
                                {addedSuburbs.map((suburb) => (
                                  <span
                                    key={suburb.id}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary"
                                  >
                                    {suburb.name}
                                    {suburb.postcode && (
                                      <span className="text-xs text-primary/60">{suburb.postcode}</span>
                                    )}
                                    <span className="text-xs text-primary/60">
                                      {suburb.state}, {suburb.country}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => removeSuburb(suburb.id)}
                                      className="ml-0.5 text-primary/50 hover:text-error"
                                      aria-label={`Remove ${suburb.name}`}
                                    >
                                      <i className="mdi mdi-close text-sm" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
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
        onConfirm={() => { setShowConfirm(false); onClose(); }}
        onClose={() => setShowConfirm(false)}
      />
    </>
  );
}
