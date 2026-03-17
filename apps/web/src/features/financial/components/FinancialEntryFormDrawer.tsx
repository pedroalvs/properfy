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
import { NumberInput } from '@/components/forms/NumberInput';
import { DateInput } from '@/components/forms/DateInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { Textarea } from '@/components/forms/Textarea';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useFinancialEntryDetail } from '../hooks/useFinancialEntryDetail';
import { useFinancialEntrySave } from '../hooks/useFinancialEntrySave';
import { ENTRY_TYPE_OPTIONS } from '../mocks/form-options';
import type { FinancialEntryFormData, FinancialEntryFormErrors } from '../types';
import { EMPTY_FINANCIAL_ENTRY_FORM } from '../types';

interface FinancialEntryFormDrawerProps {
  open: boolean;
  onClose: () => void;
  entryId?: string | null;
  onSaved: () => void;
}

export function FinancialEntryFormDrawer({ open, onClose, entryId, onSaved }: FinancialEntryFormDrawerProps) {
  const isEditMode = !!entryId;
  const { entry, isLoading: isLoadingDetail } = useFinancialEntryDetail(isEditMode ? entryId : null);
  const { save, isSaving, validate } = useFinancialEntrySave();
  const { showSuccess } = useSnackbar();

  const [form, setForm] = useState<FinancialEntryFormData>(EMPTY_FINANCIAL_ENTRY_FORM);
  const [initialData, setInitialData] = useState<FinancialEntryFormData>(EMPTY_FINANCIAL_ENTRY_FORM);
  const [errors, setErrors] = useState<FinancialEntryFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isEditMode && entry) {
      const data: FinancialEntryFormData = {
        entryType: entry.entryType,
        amount: String(Math.abs(entry.amount)),
        description: entry.description,
        relatedEntityName: entry.relatedEntityName,
        effectiveAt: entry.effectiveAt.split('T')[0]!,
        referenceNumber: entry.referenceNumber ?? '',
        notes: entry.notes ?? '',
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, entry]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_FINANCIAL_ENTRY_FORM);
      setInitialData(EMPTY_FINANCIAL_ENTRY_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(<K extends keyof FinancialEntryFormData>(field: K, value: FinancialEntryFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (prev[field]) { const next = { ...prev }; delete next[field]; return next; }
      return prev;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    const mode = isEditMode ? 'edit' : 'create';
    const validationErrors = validate(form, mode);
    if (Object.keys(validationErrors).length > 0) { setErrors(validationErrors); return; }
    const success = await save(form, entryId ?? undefined);
    if (success) {
      showSuccess(isEditMode ? 'Entry updated successfully' : 'Entry created successfully');
      onSaved();
    }
  }, [isEditMode, form, validate, save, entryId, showSuccess, onSaved]);

  const handleClose = useCallback(() => {
    if (isDirty) { setShowConfirm(true); } else { onClose(); }
  }, [isDirty, onClose]);

  const forceClose = useCallback(() => { setShowConfirm(false); onClose(); }, [onClose]);
  const cancelDiscard = useCallback(() => { setShowConfirm(false); }, []);

  return (
    <>
      <DrawerPanel open={open} onClose={handleClose} size="wide">
        <div className="flex h-full flex-col">
          <DrawerHeader title={isEditMode ? 'Edit Entry' : 'New Entry'} onClose={handleClose} />
          {isEditMode && isLoadingDetail ? (
            <div className="flex-1 px-6 py-4"><LoadingState rows={6} /></div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="flex flex-col gap-6">
                  <FormSection title="Type & Values" columns={2}>
                    <FormField label="Type" required error={errors.entryType}>
                      <SelectInput
                        value={form.entryType}
                        onChange={(v) => updateField('entryType', v)}
                        options={ENTRY_TYPE_OPTIONS}
                        placeholder="Select type"
                        disabled={isEditMode}
                        aria-label="Type"
                      />
                    </FormField>
                    <FormField label="Amount" required error={errors.amount}>
                      <NumberInput
                        value={form.amount}
                        onChange={(v) => updateField('amount', v)}
                        placeholder="0.00"
                        aria-label="Amount"
                      />
                    </FormField>
                    <FormField label="Effective Date" required error={errors.effectiveAt}>
                      <DateInput
                        value={form.effectiveAt}
                        onChange={(v) => updateField('effectiveAt', v)}
                        aria-label="Effective Date"
                      />
                    </FormField>
                    <FormField label="Reference" error={errors.referenceNumber}>
                      <TextInput
                        value={form.referenceNumber}
                        onChange={(v) => updateField('referenceNumber', v)}
                        aria-label="Reference"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Details" columns={2}>
                    <FormField label="Description" required error={errors.description}>
                      <TextInput
                        value={form.description}
                        onChange={(v) => updateField('description', v)}
                        aria-label="Description"
                      />
                    </FormField>
                    <FormField label="Related Entity" required error={errors.relatedEntityName}>
                      <TextInput
                        value={form.relatedEntityName}
                        onChange={(v) => updateField('relatedEntityName', v)}
                        aria-label="Related Entity"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Notes">
                    <FormField label="Notes" error={errors.notes}>
                      <Textarea
                        value={form.notes}
                        onChange={(v) => updateField('notes', v)}
                        rows={3}
                        placeholder="Optional notes"
                        aria-label="Notes"
                      />
                    </FormField>
                  </FormSection>
                </div>
              </div>
              <div className="border-t border-black/10 px-6 py-4">
                <FormActions>
                  <Button variant="secondary" onClick={handleClose}>Cancel</Button>
                  <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                    {isEditMode ? 'Save' : 'Create Entry'}
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
