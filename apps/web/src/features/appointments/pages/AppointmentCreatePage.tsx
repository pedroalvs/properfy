import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserRole, todayLocalDateString, isTimeStartInPastForDate } from '@properfy/shared';
import { PageHeader } from '@/components/layout/PageHeader';
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
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
import { useGoBack } from '@/hooks/useGoBack';
import { useAppointmentSave } from '../hooks/useAppointmentSave';
import { AppointmentRestrictionFields } from '../components/AppointmentRestrictionFields';
import { useTimeSlotOptions } from '../hooks/useTimeSlotOptions';
import type { AppointmentFormData, AppointmentFormErrors } from '../types';
import { EMPTY_FORM_DATA } from '../types';

export function AppointmentCreatePage() {
  const navigate = useNavigate();
  const goBack = useGoBack('/appointments');
  const { user } = useAuth();
  const { showSuccess, showError } = useSnackbar();
  const { save, isSaving, validate } = useAppointmentSave();
  const isGlobalRole = user?.role === UserRole.AM || user?.role === UserRole.OP;
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [form, setForm] = useState<AppointmentFormData>(EMPTY_FORM_DATA);
  const [initialData] = useState<AppointmentFormData>(EMPTY_FORM_DATA);
  const [errors, setErrors] = useState<AppointmentFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const effectiveTenantId = isGlobalRole ? selectedTenantId : undefined;
  const requiresTenantSelection = isGlobalRole && !selectedTenantId;

  const { options: tenantOptions } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'appointment-create'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
    undefined,
    { enabled: isGlobalRole },
  );

  const { options: branchOptions } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'appointment-create', effectiveTenantId ?? ''],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
    { ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}), status: 'ACTIVE' },
    { enabled: !isGlobalRole || !!effectiveTenantId },
  );
  const { options: serviceTypeOptions } = useFormOptions<{ id: string; name: string }>(
    ['service-types', 'appointment-create'],
    '/v1/service-types',
    (item) => ({ value: item.id, label: item.name }),
  );
  const { options: propertyOptions } = useFormOptions<{ id: string; street: string; propertyCode: string }>(
    ['properties', 'appointment-create', effectiveTenantId ?? '', 'branch', form.branchId],
    '/v1/properties',
    (item) => ({ value: item.id, label: `${item.propertyCode} - ${item.street}` }),
    {
      ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
      ...(form.branchId ? { branchId: form.branchId } : {}),
    },
    // staleTime 0 (vs the global 30s) lets this branch-scoped list refetch on window focus,
    // so a property created in the new property tab appears when the user returns here.
    { enabled: (!isGlobalRole || !!effectiveTenantId) && !!form.branchId, staleTime: 0 },
  );
  const { options: timeSlotOptions, isError: timeSlotError, error: timeSlotErrorMsg, refetch: refetchTimeSlots } = useTimeSlotOptions(
    form.branchId || undefined,
    effectiveTenantId,
  );

  useEffect(() => {
    if (!isGlobalRole) return;
    setForm((prev) => ({ ...prev, branchId: '', propertyId: '', timeSlot: '' }));
  }, [isGlobalRole, selectedTenantId]);

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

  const handleTenantChange = useCallback((tenantId: string) => {
    setSelectedTenantId(tenantId);
  }, []);

  const handleBranchChange = useCallback((branchId: string) => {
    setForm((prev) => ({ ...prev, branchId, propertyId: '', timeSlot: '' }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.branchId;
      delete next.propertyId;
      delete next.timeSlot;
      return next;
    });
  }, []);

  // Open the full property-creation page in a new tab, pre-filled with the current agency and
  // branch. Defined inline (not memoized) so it always reads the current selection. The button
  // is only enabled once a branch (and, for global roles, an agency) is selected.
  const openPropertyCreateTab = () => {
    const params = new URLSearchParams();
    if (effectiveTenantId) params.set('tenantId', effectiveTenantId);
    if (form.branchId) params.set('branchId', form.branchId);
    const query = params.toString();
    window.open(query ? `/properties/new?${query}` : '/properties/new', '_blank');
  };

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

  const handleSubmit = useCallback(async () => {
    const validationErrors = validate(form, 'create');
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      if (requiresTenantSelection) {
        showError('Select an agency before creating an appointment');
      }
      return;
    }

    if (requiresTenantSelection) {
      showError('Select an agency before creating an appointment');
      return;
    }

    const result = await save(form);
    if (result.success) {
      showSuccess('Appointment created successfully');
      if (result.id) {
        navigate(`/appointments/${result.id}`);
      } else {
        navigate('/appointments');
      }
    } else {
      showError(result.error ?? 'Failed to create appointment');
    }
  }, [form, navigate, requiresTenantSelection, save, showError, showSuccess, validate]);

  const handleBack = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      goBack();
    }
  }, [isDirty, goBack]);

  const forceBack = useCallback(() => {
    setShowConfirm(false);
    goBack();
  }, [goBack]);

  const cancelDiscard = useCallback(() => {
    setShowConfirm(false);
  }, []);

  return (
    <>
      <PageHeader
        title="New Appointment"
        secondaryActions={[
          {
            label: 'Back',
            icon: 'mdi-arrow-left',
            onClick: handleBack,
          },
        ]}
      />

      <div className="rounded bg-card-bg p-6 shadow-sm">
        <div className="flex flex-col gap-6">
          <FormSection title="Appointment Details" columns={2}>
            {isGlobalRole && (
              <>
                <FormField label="Agency" required>
                  <SelectInput
                    value={selectedTenantId}
                    onChange={handleTenantChange}
                    options={tenantOptions}
                    placeholder="Select agency"
                    aria-label="Agency"
                  />
                </FormField>
                {requiresTenantSelection && (
                  <p className="text-sm text-text-muted">
                    Select an agency before creating an appointment.
                  </p>
                )}
              </>
            )}
            <FormField label="Branch" required error={errors.branchId}>
              <SelectInput
                value={form.branchId}
                onChange={handleBranchChange}
                options={branchOptions}
                placeholder="Select branch"
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
                disabled={!form.branchId}
                error={!!errors.propertyId}
                aria-label="Property"
              />
            </FormField>
            <div className="md:col-span-2">
              <Button
                variant="secondary"
                onClick={openPropertyCreateTab}
                disabled={!form.branchId || requiresTenantSelection}
              >
                <i className="mdi mdi-home-plus-outline" aria-hidden="true" />
                Property not listed? Create one
                <i className="mdi mdi-open-in-new" aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </Button>
            </div>
            <FormField label="Service Type" required error={errors.serviceTypeId}>
              <SelectInput
                value={form.serviceTypeId}
                onChange={(v) => updateField('serviceTypeId', v)}
                options={serviceTypeOptions}
                placeholder="Select type"
                error={!!errors.serviceTypeId}
                aria-label="Service Type"
              />
            </FormField>
            <FormField label="Scheduled Date" required error={errors.scheduledDate}>
              <DateInput
                value={form.scheduledDate}
                onChange={(v) => updateField('scheduledDate', v)}
                min={todayLocalDateString()}
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
                  options={(() => {
                    const today = todayLocalDateString();
                    if (form.scheduledDate !== today) return timeSlotOptions;
                    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    return timeSlotOptions.filter((opt) => !isTimeStartInPastForDate(opt.value, form.scheduledDate, tz));
                  })()}
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
                placeholder="(00) 00000-0000"
                error={!!errors.contactPhone}
                aria-label="Phone"
              />
            </FormField>
            <FormField label="Email" error={errors.contactEmail}>
              <EmailInput
                value={form.contactEmail}
                onChange={(v) => updateField('contactEmail', v)}
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

        <div className="mt-6">
          <FormActions>
            <Button variant="secondary" onClick={handleBack}>
              Cancel
            </Button>
            <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
              Create Appointment
            </Button>
          </FormActions>
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
