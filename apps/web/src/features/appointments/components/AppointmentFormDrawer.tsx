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
import { DateInput } from '@/components/forms/DateInput';
import { Textarea } from '@/components/forms/Textarea';
import { Checkbox } from '@/components/forms/Checkbox';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
import { useAppointmentDetail } from '../hooks/useAppointmentDetail';
import { useAppointmentSave } from '../hooks/useAppointmentSave';
import { TIME_SLOT_OPTIONS } from '../constants/form-options';
import type { AppointmentFormData, AppointmentFormErrors } from '../types';
import { EMPTY_FORM_DATA } from '../types';

interface AppointmentFormDrawerProps {
  open: boolean;
  onClose: () => void;
  appointmentId?: string | null;
  onSaved: () => void;
}

export function AppointmentFormDrawer({
  open,
  onClose,
  appointmentId,
  onSaved,
}: AppointmentFormDrawerProps) {
  const { user } = useAuth();
  const isGlobalRole = user?.role === 'AM' || user?.role === 'OP';

  const [selectedTenantId, setSelectedTenantId] = useState('');

  const { options: tenantOptions } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'form-options'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
    undefined,
    { enabled: isGlobalRole },
  );

  const effectiveTenantId = isGlobalRole ? selectedTenantId : undefined;

  const { options: branchOptions } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'form-options', effectiveTenantId ?? ''],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
    effectiveTenantId ? { tenantId: effectiveTenantId } : undefined,
    { enabled: !isGlobalRole || !!effectiveTenantId },
  );
  const { options: serviceTypeOptions } = useFormOptions<{ id: string; name: string }>(
    ['service-types', 'form-options'],
    '/v1/service-types',
    (item) => ({ value: item.id, label: item.name }),
  );
  const { options: propertyOptions } = useFormOptions<{ id: string; street: string; propertyCode: string }>(
    ['properties', 'form-options', effectiveTenantId ?? ''],
    '/v1/properties',
    (item) => ({ value: item.id, label: `${item.propertyCode} - ${item.street}` }),
    effectiveTenantId ? { tenantId: effectiveTenantId } : undefined,
    { enabled: !isGlobalRole || !!effectiveTenantId },
  );

  const isEditMode = !!appointmentId;
  const { appointment, isLoading: isLoadingDetail } = useAppointmentDetail(
    isEditMode ? appointmentId : null,
  );
  const { save, isSaving, validate } = useAppointmentSave();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<AppointmentFormData>(EMPTY_FORM_DATA);
  const [initialData, setInitialData] = useState<AppointmentFormData>(EMPTY_FORM_DATA);
  const [errors, setErrors] = useState<AppointmentFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  // Populate form in edit mode
  useEffect(() => {
    if (isEditMode && appointment) {
      const data: AppointmentFormData = {
        branchId: appointment.branchId,
        propertyId: appointment.propertyId,
        serviceTypeId: appointment.serviceTypeId,
        scheduledDate: (appointment.scheduledDate ?? '').split('T')[0] ?? '',
        timeSlot: appointment.timeSlot,
        contactName: appointment.contactName,
        contactPhone: appointment.contactPhone ?? '',
        contactEmail: appointment.contactEmail ?? '',
        keyRequired: appointment.keyRequired,
        meetingLocation: appointment.meetingLocation ?? '',
        keyLocation: appointment.keyLocation ?? '',
        notes: appointment.notes ?? '',
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, appointment]);

  // Reset form when opening in create mode
  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_FORM_DATA);
      setInitialData(EMPTY_FORM_DATA);
      setErrors({});
      setSelectedTenantId('');
    }
  }, [open, isEditMode]);

  const handleTenantChange = useCallback((tenantId: string) => {
    setSelectedTenantId(tenantId);
    setForm((prev) => ({ ...prev, branchId: '', propertyId: '' }));
  }, []);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(
    <K extends keyof AppointmentFormData>(field: K, value: AppointmentFormData[K]) => {
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
    const mode = isEditMode ? 'edit' : 'create';
    const validationErrors = validate(form, mode);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const result = await save(form, appointmentId ?? undefined);
    if (result.success) {
      showSuccess(isEditMode ? 'Appointment updated successfully' : 'Appointment created successfully');
      onSaved();
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, validate, save, appointmentId, showSuccess, showError, onSaved]);

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
            title={isEditMode ? 'Edit Appointment' : 'New Appointment'}
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
                  <FormSection title="Appointment Details" columns={2}>
                    {isGlobalRole && !isEditMode && (
                      <FormField label="Agency" required>
                        <SelectInput
                          value={selectedTenantId}
                          onChange={handleTenantChange}
                          options={tenantOptions}
                          placeholder="Select agency"
                          aria-label="Agency"
                        />
                      </FormField>
                    )}
                    <FormField label="Branch" required error={errors.branchId}>
                      <SelectInput
                        value={form.branchId}
                        onChange={(v) => updateField('branchId', v)}
                        options={branchOptions}
                        placeholder="Select branch"
                        disabled={isEditMode}
                        error={!!errors.branchId}
                        aria-label="Branch"
                      />
                    </FormField>
                    <FormField label="Property" required error={errors.propertyId}>
                      <SelectInput
                        value={form.propertyId}
                        onChange={(v) => updateField('propertyId', v)}
                        options={propertyOptions}
                        placeholder="Select property"
                        disabled={isEditMode}
                        error={!!errors.propertyId}
                        aria-label="Property"
                      />
                    </FormField>
                    <FormField label="Service Type" required error={errors.serviceTypeId}>
                      <SelectInput
                        value={form.serviceTypeId}
                        onChange={(v) => updateField('serviceTypeId', v)}
                        options={serviceTypeOptions}
                        placeholder="Select type"
                        disabled={isEditMode}
                        error={!!errors.serviceTypeId}
                        aria-label="Service Type"
                      />
                    </FormField>
                    <FormField label="Scheduled Date" required error={errors.scheduledDate}>
                      <DateInput
                        value={form.scheduledDate}
                        onChange={(v) => updateField('scheduledDate', v)}
                        error={!!errors.scheduledDate}
                        aria-label="Scheduled Date"
                      />
                    </FormField>
                    <FormField label="Time Slot" required error={errors.timeSlot}>
                      <SelectInput
                        value={form.timeSlot}
                        onChange={(v) => updateField('timeSlot', v)}
                        options={TIME_SLOT_OPTIONS}
                        placeholder="Select time slot"
                        error={!!errors.timeSlot}
                        aria-label="Time Slot"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Tenant Contact" columns={2}>
                    <FormField label="Tenant Name" required error={errors.contactName}>
                      <TextInput
                        value={form.contactName}
                        onChange={(v) => updateField('contactName', v)}
                        placeholder="Full name"
                        error={!!errors.contactName}
                        aria-label="Tenant Name"
                      />
                    </FormField>
                    <FormField label="Phone" error={errors.contactPhone}>
                      <TextInput
                        value={form.contactPhone}
                        onChange={(v) => updateField('contactPhone', v)}
                        type="tel"
                        placeholder="(00) 00000-0000"
                        error={!!errors.contactPhone}
                        aria-label="Phone"
                      />
                    </FormField>
                    <FormField label="Email" error={errors.contactEmail}>
                      <TextInput
                        value={form.contactEmail}
                        onChange={(v) => updateField('contactEmail', v)}
                        type="email"
                        placeholder="email@example.com"
                        error={!!errors.contactEmail}
                        aria-label="Email"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Access & Key" columns={2}>
                    <div className="flex items-center">
                      <Checkbox
                        label="Key required"
                        checked={form.keyRequired}
                        onChange={(v) => updateField('keyRequired', v)}
                      />
                    </div>
                    <div />
                    <FormField label="Meeting Location" error={errors.meetingLocation}>
                      <TextInput
                        value={form.meetingLocation}
                        onChange={(v) => updateField('meetingLocation', v)}
                        placeholder="Where to meet"
                        aria-label="Meeting Location"
                      />
                    </FormField>
                    <FormField label="Key Location" error={errors.keyLocation}>
                      <TextInput
                        value={form.keyLocation}
                        onChange={(v) => updateField('keyLocation', v)}
                        placeholder="Where to pick up key"
                        aria-label="Key Location"
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
              </div>

              <div className="border-t border-black/10 px-6 py-4">
                <FormActions>
                  <Button variant="secondary" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                    {isEditMode ? 'Save' : 'Create Appointment'}
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
