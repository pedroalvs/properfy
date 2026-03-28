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
import { EmailInput } from '@/components/forms/EmailInput';
import { PhoneInput } from '@/components/forms/PhoneInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { DateInput } from '@/components/forms/DateInput';
import { Textarea } from '@/components/forms/Textarea';
import { Checkbox } from '@/components/forms/Checkbox';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
import { PropertyFormDrawer } from '@/features/properties/components/PropertyFormDrawer';
import { useAppointmentDetail } from '../hooks/useAppointmentDetail';
import { useAppointmentSave } from '../hooks/useAppointmentSave';
import { AppointmentRestrictionFields } from './AppointmentRestrictionFields';
import { useTimeSlotOptions } from '../hooks/useTimeSlotOptions';
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

  const isEditMode = !!appointmentId;
  const { appointment, isLoading: isLoadingDetail } = useAppointmentDetail(
    isEditMode ? appointmentId : null,
  );

  const [form, setForm] = useState<AppointmentFormData>(EMPTY_FORM_DATA);
  const [initialData, setInitialData] = useState<AppointmentFormData>(EMPTY_FORM_DATA);
  const [errors, setErrors] = useState<AppointmentFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [propertyDrawerOpen, setPropertyDrawerOpen] = useState(false);

  // In edit mode, derive tenantId from the loaded appointment so branch/property options load
  const effectiveTenantId = isGlobalRole
    ? (selectedTenantId || (isEditMode && appointment?.tenantId) || '')
    : undefined;

  const { options: branchOptions } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'form-options', effectiveTenantId ?? ''],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
    { ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}), status: 'ACTIVE' },
    { enabled: !isGlobalRole || !!effectiveTenantId },
  );
  const { options: serviceTypeOptions } = useFormOptions<{ id: string; name: string }>(
    ['service-types', 'form-options'],
    '/v1/service-types',
    (item) => ({ value: item.id, label: item.name }),
  );
  const { options: propertyOptions } = useFormOptions<{ id: string; street: string; propertyCode: string }>(
    ['properties', 'form-options', effectiveTenantId ?? '', 'branch', form.branchId],
    '/v1/properties',
    (item) => ({ value: item.id, label: `${item.propertyCode} - ${item.street}` }),
    {
      ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
      ...(form.branchId ? { branchId: form.branchId } : {}),
    },
    { enabled: (!isGlobalRole || !!effectiveTenantId) && !!form.branchId },
  );
  const { options: timeSlotOptions, isError: timeSlotError, error: timeSlotErrorMsg, refetch: refetchTimeSlots } = useTimeSlotOptions(
    form.branchId || undefined,
    effectiveTenantId,
  );

  const { save, isSaving, validate } = useAppointmentSave();
  const { showSuccess, showError } = useSnackbar();

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
        hasRestriction: (appointment.restrictions?.length ?? 0) > 0,
        restrictionIsHome: appointment.restrictions?.[0]?.isHome ?? false,
        restrictionNotes: appointment.restrictions?.[0]?.notes ?? '',
        restrictionTouched: false,
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
    setForm((prev) => ({ ...prev, branchId: '', propertyId: '', timeSlot: '' }));
  }, []);

  const handleBranchChange = useCallback((branchId: string) => {
    setForm((prev) => ({ ...prev, branchId, propertyId: '' }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.branchId;
      delete next.propertyId;
      return next;
    });
  }, []);

  const handleRestrictionToggle = useCallback((value: boolean) => {
    setForm((prev) => ({
      ...prev,
      hasRestriction: value,
      restrictionTouched: true,
      ...(value ? {} : { restrictionIsHome: false, restrictionNotes: '' }),
    }));
  }, []);

  const handleRestrictionIsHomeChange = useCallback((value: boolean) => {
    setForm((prev) => ({
      ...prev,
      hasRestriction: true,
      restrictionIsHome: value,
      restrictionTouched: true,
    }));
  }, []);

  const handleRestrictionNotesChange = useCallback((value: string) => {
    setForm((prev) => ({
      ...prev,
      hasRestriction: true,
      restrictionNotes: value,
      restrictionTouched: true,
    }));
    setErrors((prev) => {
      if (prev.restrictionNotes) {
        const next = { ...prev };
        delete next.restrictionNotes;
        return next;
      }
      return prev;
    });
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
                        onChange={handleBranchChange}
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
                        disabled={isEditMode || !form.branchId}
                        error={!!errors.propertyId}
                        aria-label="Property"
                      />
                    </FormField>
                    {!isEditMode && (
                      <div className="md:col-span-2">
                        <Button
                          variant="secondary"
                          onClick={() => setPropertyDrawerOpen(true)}
                          disabled={!form.branchId || (isGlobalRole && !selectedTenantId)}
                        >
                          <i className="mdi mdi-home-plus-outline" aria-hidden="true" />
                          Property not listed? Create one
                        </Button>
                      </div>
                    )}
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
                    <FormField label="Time Slot" required error={errors.timeSlot ?? (timeSlotError ? (timeSlotErrorMsg ?? undefined) : undefined)}>
                      {timeSlotError ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-error">Failed to load time slots</span>
                          <button type="button" className="text-sm font-semibold text-primary" onClick={() => refetchTimeSlots()}>Retry</button>
                        </div>
                      ) : (
                        <SelectInput
                          value={form.timeSlot}
                          onChange={(v) => updateField('timeSlot', v)}
                          options={timeSlotOptions}
                          placeholder={!form.branchId ? 'Select a branch first' : 'Select time slot'}
                          disabled={!form.branchId || timeSlotOptions.length === 0}
                          error={!!errors.timeSlot}
                          aria-label="Time Slot"
                        />
                      )}
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
                      <PhoneInput
                        value={form.contactPhone}
                        onChange={(v) => updateField('contactPhone', v)}
                        error={!!errors.contactPhone}
                        aria-label="Phone"
                      />
                    </FormField>
                    <FormField label="Email" error={errors.contactEmail}>
                      <EmailInput
                        value={form.contactEmail}
                        onChange={(v) => updateField('contactEmail', v)}
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

                  <AppointmentRestrictionFields
                    form={form}
                    errors={errors}
                    onToggleRestriction={handleRestrictionToggle}
                    onToggleIsHome={handleRestrictionIsHomeChange}
                    onChangeNotes={handleRestrictionNotesChange}
                  />

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
      <PropertyFormDrawer
        open={propertyDrawerOpen}
        onClose={() => setPropertyDrawerOpen(false)}
        onSaved={() => setPropertyDrawerOpen(false)}
        tenantIdOverride={effectiveTenantId}
        initialBranchId={form.branchId}
        lockBranch
        onCreated={(propertyId) => {
          setPropertyDrawerOpen(false);
          updateField('propertyId', propertyId);
        }}
      />
    </>
  );
}
