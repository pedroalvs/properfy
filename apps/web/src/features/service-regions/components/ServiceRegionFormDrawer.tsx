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
import { useSnackbar } from '@/hooks/useSnackbar';
import { useServiceRegionDetail } from '../hooks/useServiceRegionDetail';
import { useServiceRegionSave } from '../hooks/useServiceRegionSave';
import { RegionMap } from './RegionMap';
import type { ServiceRegionFormData, ServiceRegionFormErrors } from '../types';
import { EMPTY_SERVICE_REGION_FORM } from '../types';

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

const COLOR_OPTIONS = [
  { value: '#3b82f6', label: 'Blue' },
  { value: '#ef4444', label: 'Red' },
  { value: '#22c55e', label: 'Green' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#f97316', label: 'Orange' },
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

  useEffect(() => {
    if (isEditMode && serviceRegion) {
      const data: ServiceRegionFormData = {
        name: serviceRegion.name,
        geojson: serviceRegion.geojson ?? null,
        color: serviceRegion.color ?? '#3b82f6',
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

  const handleDraw = useCallback((geojson: object) => {
    updateField('geojson', geojson);
  }, [updateField]);

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
                    <FormField label="Color">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-8 w-8 shrink-0 rounded border border-black/10"
                          style={{ backgroundColor: form.color }}
                        />
                        <SelectInput
                          value={form.color}
                          onChange={(v) => updateField('color', v)}
                          options={COLOR_OPTIONS}
                          aria-label="Color"
                        />
                      </div>
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

                  <FormSection title="Region Polygon">
                    <FormField
                      label="Draw the region polygon on the map"
                      error={errors.geojson}
                    >
                      <RegionMap
                        geojson={isEditMode && serviceRegion?.geojson ? serviceRegion.geojson : undefined}
                        onDraw={handleDraw}
                        editable
                        height="400px"
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
