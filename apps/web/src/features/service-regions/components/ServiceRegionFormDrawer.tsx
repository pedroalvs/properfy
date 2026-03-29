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
  const [suburbSearch, setSuburbSearch] = useState('');

  const { suburbs, isLoading: isLoadingSuburbs } = useSuburbList(suburbSearch);

  useEffect(() => {
    if (isEditMode && serviceRegion) {
      const data: ServiceRegionFormData = {
        name: serviceRegion.name,
        country: serviceRegion.country,
        state: serviceRegion.state,
        suburbIds: serviceRegion.suburbs?.map(s => s.id) ?? [],
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
      setSuburbSearch('');
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

  // Build a combined list of suburbs: loaded suburbs + any currently selected suburbs from the detail
  const selectedSuburbNames = new Map<string, string>();
  if (serviceRegion?.suburbs) {
    for (const s of serviceRegion.suburbs) {
      selectedSuburbNames.set(s.id, `${s.name} (${s.city}, ${s.state})`);
    }
  }
  for (const s of suburbs) {
    selectedSuburbNames.set(s.id, `${s.name} (${s.city}, ${s.state})`);
  }

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
                      <TextInput
                        value={form.state}
                        onChange={(v) => updateField('state', v)}
                        placeholder="e.g. NSW, VIC"
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
                    <FormField label={`Suburbs (${form.suburbIds.length} selected)`} error={errors.suburbIds}>
                      <div className="flex flex-col gap-3 rounded border border-black/10 px-3 py-3">
                        <TextInput
                          value={suburbSearch}
                          onChange={setSuburbSearch}
                          placeholder="Search suburbs..."
                          aria-label="Search suburbs"
                        />
                        <div className="max-h-60 overflow-y-auto">
                          {suburbs.length > 0 ? (
                            <div className="grid gap-2">
                              {suburbs.map((suburb) => (
                                <Checkbox
                                  key={suburb.id}
                                  label={`${suburb.name} (${suburb.city}, ${suburb.state}) ${suburb.postcode ? `- ${suburb.postcode}` : ''}`}
                                  checked={form.suburbIds.includes(suburb.id)}
                                  onChange={(checked) => toggleSuburb(suburb.id, checked)}
                                />
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-text-muted">
                              {isLoadingSuburbs ? 'Loading suburbs...' : 'No suburbs found.'}
                            </p>
                          )}
                        </div>
                      </div>
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
