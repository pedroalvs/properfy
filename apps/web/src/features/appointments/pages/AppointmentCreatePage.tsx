import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { TextInput } from '@/components/forms/TextInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { DateInput } from '@/components/forms/DateInput';
import { Textarea } from '@/components/forms/Textarea';
import { Checkbox } from '@/components/forms/Checkbox';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useFormOptions } from '@/hooks/useFormOptions';
import { useAppointmentSave } from '../hooks/useAppointmentSave';
import { TIME_SLOT_OPTIONS } from '../constants/form-options';
import type { AppointmentFormData, AppointmentFormErrors } from '../types';
import { EMPTY_FORM_DATA } from '../types';

export function AppointmentCreatePage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useSnackbar();
  const { save, isSaving, validate } = useAppointmentSave();

  const { options: branchOptions } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'form-options'],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
  );
  const { options: serviceTypeOptions } = useFormOptions<{ id: string; name: string }>(
    ['service-types', 'form-options'],
    '/v1/service-types',
    (item) => ({ value: item.id, label: item.name }),
  );
  const { options: propertyOptions } = useFormOptions<{ id: string; street: string; propertyCode: string }>(
    ['properties', 'form-options'],
    '/v1/properties',
    (item) => ({ value: item.id, label: `${item.propertyCode} - ${item.street}` }),
  );

  const [form, setForm] = useState<AppointmentFormData>(EMPTY_FORM_DATA);
  const [initialData] = useState<AppointmentFormData>(EMPTY_FORM_DATA);
  const [errors, setErrors] = useState<AppointmentFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

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
    const validationErrors = validate(form, 'create');
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
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
  }, [form, validate, save, showSuccess, showError, navigate]);

  const handleBack = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      navigate(-1);
    }
  }, [isDirty, navigate]);

  const forceBack = useCallback(() => {
    setShowConfirm(false);
    navigate(-1);
  }, [navigate]);

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
            <FormField label="Branch" required error={errors.branchId}>
              <SelectInput
                value={form.branchId}
                onChange={(v) => updateField('branchId', v)}
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
