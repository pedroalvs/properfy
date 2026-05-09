import { useCallback, useEffect, useState } from 'react';
import type { ContactChannelType } from '@properfy/shared';
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
import { useSnackbar } from '@/hooks/useSnackbar';
import { useContactDetail } from '../hooks/useContactDetail';
import { useContactSave } from '../hooks/useContactSave';
import { CONTACT_TYPE_OPTIONS, CONTACT_CHANNEL_OPTIONS } from '../constants/form-options';
import { EMPTY_CONTACT_FORM, type ContactFormData, type ContactFormErrors } from '../types';

interface ContactFormDrawerProps {
  open: boolean;
  onClose: () => void;
  contactId?: string | null;
  onSaved: () => void;
  /** Pre-fills the create call's tenantId; only used by AM via the agency selector. */
  tenantIdOverride?: string;
  onCreated?: (contactId: string) => void;
}

/**
 * Maps a backend error code to a field-level form error so the drawer can
 * surface the conflict inline (mirrors the property/user form pattern).
 */
function mapErrorCodeToField(code: string | undefined): { field: keyof ContactFormErrors; message: string } | null {
  switch (code) {
    case 'CONTACT_EMAIL_EXISTS':
      return { field: 'primaryEmail', message: 'A contact with this email already exists' };
    case 'CONTACT_PHONE_EXISTS':
      return { field: 'primaryPhone', message: 'A contact with this phone already exists' };
    default:
      return null;
  }
}

export function ContactFormDrawer({
  open,
  onClose,
  contactId,
  onSaved,
  tenantIdOverride,
  onCreated,
}: ContactFormDrawerProps) {
  const isEditMode = !!contactId;
  const { contact, isLoading: isLoadingDetail } = useContactDetail(isEditMode ? contactId : null);
  const { save, isSaving, validate } = useContactSave();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<ContactFormData>(EMPTY_CONTACT_FORM);
  const [initialData, setInitialData] = useState<ContactFormData>(EMPTY_CONTACT_FORM);
  const [errors, setErrors] = useState<ContactFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isEditMode && contact) {
      const data: ContactFormData = {
        type: contact.type,
        displayName: contact.displayName,
        company: contact.company ?? '',
        primaryEmail: contact.primaryEmail ?? '',
        primaryPhone: contact.primaryPhone ?? '',
        notes: contact.notes ?? '',
        additionalChannels: contact.additionalChannels.map((c) => ({
          channel: c.channel,
          value: c.value,
          label: c.label ?? '',
        })),
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, contact]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_CONTACT_FORM);
      setInitialData(EMPTY_CONTACT_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(<K extends keyof ContactFormData>(field: K, value: ContactFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (prev[field as keyof ContactFormErrors]) {
        const next = { ...prev };
        delete next[field as keyof ContactFormErrors];
        return next;
      }
      return prev;
    });
  }, []);

  const addChannel = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      additionalChannels: [...prev.additionalChannels, { channel: 'EMAIL', value: '', label: '' }],
    }));
  }, []);

  const removeChannel = useCallback((index: number) => {
    setForm((prev) => ({
      ...prev,
      additionalChannels: prev.additionalChannels.filter((_, i) => i !== index),
    }));
  }, []);

  const updateChannel = useCallback(
    (index: number, patch: Partial<{ channel: ContactChannelType | ''; value: string; label: string }>) => {
      setForm((prev) => ({
        ...prev,
        additionalChannels: prev.additionalChannels.map((c, i) => (i === index ? { ...c, ...patch } : c)),
      }));
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    const mode = isEditMode ? 'edit' : 'create';
    const validationErrors = validate(form, mode);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    const result = await save(form, contactId ?? undefined, tenantIdOverride);
    if (result.success) {
      showSuccess(isEditMode ? 'Contact updated successfully' : 'Contact created successfully');
      if (!isEditMode && result.id) onCreated?.(result.id);
      onSaved();
      return;
    }
    const fieldError = mapErrorCodeToField(result.errorCode);
    if (fieldError) {
      setErrors((prev) => ({ ...prev, [fieldError.field]: fieldError.message }));
      return;
    }
    showError(result.errorMessage ?? 'Failed to save contact');
  }, [isEditMode, form, validate, save, contactId, tenantIdOverride, showSuccess, showError, onSaved, onCreated]);

  const handleClose = useCallback(() => {
    if (isDirty) setShowConfirm(true);
    else onClose();
  }, [isDirty, onClose]);

  return (
    <>
      <DrawerPanel open={open} onClose={handleClose} size="wide">
        <div className="flex h-full flex-col">
          <DrawerHeader title={isEditMode ? 'Edit Contact' : 'New Contact'} onClose={handleClose} />
          {isEditMode && isLoadingDetail ? (
            <div className="flex-1 px-6 py-4"><LoadingState rows={6} /></div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {isEditMode ? (
                  <div
                    role="note"
                    className="mb-4 rounded border border-info bg-info/10 px-4 py-3 text-sm text-text-primary"
                  >
                    Editing this contact updates the registry only. Existing appointments
                    keep the snapshot taken at link time.
                  </div>
                ) : null}
                <div className="flex flex-col gap-6">
                  <FormSection title="Identification" columns={2}>
                    <FormField label="Type" required error={errors.type}>
                      <SelectInput
                        value={form.type}
                        onChange={(v) => updateField('type', v)}
                        options={CONTACT_TYPE_OPTIONS}
                        placeholder="Select type"
                        aria-label="Type"
                      />
                    </FormField>
                    <FormField label="Display name" required error={errors.displayName}>
                      <TextInput
                        value={form.displayName}
                        onChange={(v) => updateField('displayName', v)}
                        aria-label="Display name"
                      />
                    </FormField>
                    <FormField label="Company" error={errors.company}>
                      <TextInput
                        value={form.company}
                        onChange={(v) => updateField('company', v)}
                        aria-label="Company"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Primary channels" columns={2}>
                    <FormField label="Primary email" error={errors.primaryEmail}>
                      <TextInput
                        type="email"
                        value={form.primaryEmail}
                        onChange={(v) => updateField('primaryEmail', v)}
                        aria-label="Primary email"
                      />
                    </FormField>
                    <FormField label="Primary phone" error={errors.primaryPhone}>
                      <TextInput
                        value={form.primaryPhone}
                        onChange={(v) => updateField('primaryPhone', v)}
                        aria-label="Primary phone"
                      />
                    </FormField>
                  </FormSection>
                  <p className="-mt-3 text-xs text-text-secondary">
                    Provide at least one of email or phone.
                  </p>

                  <FormSection title="Additional channels">
                    {errors.additionalChannels ? (
                      <p className="text-sm text-error">{errors.additionalChannels}</p>
                    ) : null}
                    <div className="flex flex-col gap-3">
                      {form.additionalChannels.map((c, idx) => (
                        <div key={idx} className="flex items-end gap-2">
                          <div className="w-32">
                            <FormField label="Channel">
                              <SelectInput
                                value={c.channel || ''}
                                onChange={(v) => updateChannel(idx, { channel: v as ContactChannelType })}
                                options={CONTACT_CHANNEL_OPTIONS}
                                aria-label={`Channel ${idx + 1} type`}
                              />
                            </FormField>
                          </div>
                          <div className="flex-1">
                            <FormField label="Value">
                              <TextInput
                                value={c.value}
                                onChange={(v) => updateChannel(idx, { value: v })}
                                aria-label={`Channel ${idx + 1} value`}
                              />
                            </FormField>
                          </div>
                          <div className="flex-1">
                            <FormField label="Label (optional)">
                              <TextInput
                                value={c.label}
                                onChange={(v) => updateChannel(idx, { label: v })}
                                aria-label={`Channel ${idx + 1} label`}
                              />
                            </FormField>
                          </div>
                          <Button
                            variant="icon"
                            onClick={() => removeChannel(idx)}
                            aria-label={`Remove channel ${idx + 1}`}
                          >
                            <i className="mdi mdi-close text-base" aria-hidden="true" />
                          </Button>
                        </div>
                      ))}
                      <div>
                        <Button variant="outlined" onClick={addChannel} aria-label="Add additional channel">
                          <i className="mdi mdi-plus" aria-hidden="true" /> Add channel
                        </Button>
                      </div>
                    </div>
                  </FormSection>

                  <FormSection title="Observations">
                    <FormField label="Notes" error={errors.notes}>
                      <Textarea
                        value={form.notes}
                        onChange={(v) => updateField('notes', v)}
                        rows={3}
                        aria-label="Notes"
                      />
                    </FormField>
                  </FormSection>
                </div>
              </div>
              <FormActions>
                <Button variant="secondary" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleSubmit} loading={isSaving}>
                  {isEditMode ? 'Save changes' : 'Create contact'}
                </Button>
              </FormActions>
            </>
          )}
        </div>
      </DrawerPanel>
      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => {
          setShowConfirm(false);
          onClose();
        }}
        title="Discard changes?"
        message="You have unsaved changes. Discard them?"
        confirmLabel="Discard"
        variant="warning"
      />
    </>
  );
}
