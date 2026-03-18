import { useState, useEffect, useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { TextInput } from '@/components/forms/TextInput';
import { NumberInput } from '@/components/forms/NumberInput';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useSlotSave } from '../hooks/useSlotSave';
import type { SlotFormData, SlotFormErrors, AvailabilitySlot } from '../types';
import { DEFAULT_SLOT_FORM } from '../types';

interface SlotFormDrawerProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  slotId?: string | null;
  initialData?: AvailabilitySlot | null;
}

export function SlotFormDrawer({
  open,
  onClose,
  onSaved,
  slotId,
  initialData,
}: SlotFormDrawerProps) {
  const isEditMode = !!slotId;
  const { save, isSaving, validate } = useSlotSave();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<SlotFormData>(DEFAULT_SLOT_FORM);
  const [savedForm, setSavedForm] = useState<SlotFormData>(DEFAULT_SLOT_FORM);
  const [errors, setErrors] = useState<SlotFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isEditMode && initialData) {
      const data: SlotFormData = {
        inspectorId: initialData.inspectorId,
        date: initialData.date,
        startTime: initialData.startTime,
        endTime: initialData.endTime,
        region: initialData.region,
        capacity: initialData.capacity,
      };
      setForm(data);
      setSavedForm(data);
      setErrors({});
    }
  }, [isEditMode, initialData]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(DEFAULT_SLOT_FORM);
      setSavedForm(DEFAULT_SLOT_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  const updateField = useCallback(
    <K extends keyof SlotFormData>(field: K, value: SlotFormData[K]) => {
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
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const result = await save(form, slotId ?? undefined);
    if (result.success) {
      showSuccess(isEditMode ? 'Slot updated successfully' : 'Slot created successfully');
      onSaved();
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, validate, save, slotId, showSuccess, showError, onSaved]);

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
            title={isEditMode ? 'Edit Slot' : 'Create Slot'}
            onClose={handleClose}
          />

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-6">
              <FormSection title="Slot Details" columns={2}>
                <FormField label="Inspector ID" required error={errors.inspectorId}>
                  <TextInput
                    value={form.inspectorId}
                    onChange={(v) => updateField('inspectorId', v)}
                    placeholder="Inspector identifier"
                    error={!!errors.inspectorId}
                    aria-label="Inspector ID"
                  />
                </FormField>
                <FormField label="Date" required error={errors.date}>
                  <TextInput
                    value={form.date}
                    onChange={(v) => updateField('date', v)}
                    placeholder="YYYY-MM-DD"
                    error={!!errors.date}
                    aria-label="Date"
                  />
                </FormField>
                <FormField label="Start Time" required error={errors.startTime}>
                  <TextInput
                    value={form.startTime}
                    onChange={(v) => updateField('startTime', v)}
                    placeholder="HH:MM"
                    error={!!errors.startTime}
                    aria-label="Start Time"
                  />
                </FormField>
                <FormField label="End Time" required error={errors.endTime}>
                  <TextInput
                    value={form.endTime}
                    onChange={(v) => updateField('endTime', v)}
                    placeholder="HH:MM"
                    error={!!errors.endTime}
                    aria-label="End Time"
                  />
                </FormField>
                <FormField label="Region" required error={errors.region}>
                  <TextInput
                    value={form.region}
                    onChange={(v) => updateField('region', v)}
                    placeholder="Coverage region"
                    error={!!errors.region}
                    aria-label="Region"
                  />
                </FormField>
                <FormField label="Capacity" required error={errors.capacity}>
                  <NumberInput
                    value={String(form.capacity)}
                    onChange={(v) => updateField('capacity', Number(v) || 0)}
                    placeholder="1"
                    error={!!errors.capacity}
                    aria-label="Capacity"
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
                {isEditMode ? 'Save' : 'Create Slot'}
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
