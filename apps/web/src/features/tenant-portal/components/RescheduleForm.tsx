import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { DateInput } from '@/components/forms/DateInput';
import { Textarea } from '@/components/forms/Textarea';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useRescheduleRequest } from '../hooks/usePortalData';
import type { PortalAppointment } from '../types';

interface RescheduleFormProps {
  appointment: PortalAppointment;
  token: string;
  isReadOnly: boolean;
}

export function RescheduleForm({
  appointment,
  token,
  isReadOnly,
}: RescheduleFormProps) {
  const { showSuccess, showError } = useSnackbar();
  const rescheduleMutation = useRescheduleRequest(token);

  const [newDate, setNewDate] = useState('');
  const [newTimeSlot, setNewTimeSlot] = useState('');
  const [tenantNote, setTenantNote] = useState('');
  const [errors, setErrors] = useState<{ date?: string; timeSlot?: string }>({});
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="rounded bg-card-bg p-6 shadow-sm">
        <div className="flex items-center gap-3 text-info">
          <i className="mdi mdi-calendar-clock text-2xl" />
          <div>
            <h2 className="text-base font-bold">Reschedule Requested</h2>
            <p className="text-sm text-text-secondary">
              Your reschedule request has been submitted. The team will review it shortly.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const validate = (): boolean => {
    const newErrors: { date?: string; timeSlot?: string } = {};

    if (!newDate) {
      newErrors.date = 'Please select a new date.';
    } else {
      const selected = new Date(newDate + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selected <= today) {
        newErrors.date = 'Date must be in the future.';
      }
      const original = new Date(appointment.scheduledDate + 'T00:00:00');
      const maxDate = new Date(original);
      maxDate.setDate(maxDate.getDate() + 30);
      if (selected > maxDate) {
        newErrors.date = 'Date must be within 30 days of the original date.';
      }
    }

    if (!newTimeSlot.trim()) {
      newErrors.timeSlot = 'Please enter a time slot.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      await rescheduleMutation.mutateAsync({
        newDate,
        newTimeSlot: newTimeSlot.trim(),
        ...(tenantNote.trim() ? { tenantNote: tenantNote.trim() } : {}),
      });
      setSubmitted(true);
      showSuccess('Reschedule request submitted successfully.');
    } catch (err) {
      showError(
        err instanceof Error ? err.message : 'Failed to submit reschedule request.',
      );
    }
  };

  return (
    <div className="rounded bg-card-bg p-6 shadow-sm">
      <h2 className="mb-2 text-base font-bold text-secondary">
        Request Reschedule
      </h2>
      <p className="mb-4 text-sm text-text-secondary">
        If the scheduled date doesn't work for you, request a new date and time.
      </p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField label="New Date" required error={errors.date}>
          <DateInput
            value={newDate}
            onChange={setNewDate}
            disabled={isReadOnly}
          />
        </FormField>

        <FormField label="Preferred Time Slot" required error={errors.timeSlot}>
          <TextInput
            value={newTimeSlot}
            onChange={setNewTimeSlot}
            placeholder="e.g. 09:00-11:00"
            disabled={isReadOnly}
          />
        </FormField>

        <div>
          <label
            htmlFor="reschedule-tenant-note"
            className="mb-1 block text-sm font-medium text-text-secondary"
          >
            Additional notes
          </label>
          <Textarea
            id="reschedule-tenant-note"
            value={tenantNote}
            onChange={setTenantNote}
            placeholder="Any additional information for the operator (optional)"
            disabled={isReadOnly}
            rows={3}
            maxLength={2000}
            aria-label="Additional notes"
          />
          <p className="mt-1 text-xs text-text-muted">
            {tenantNote.length}/2000 characters
          </p>
        </div>

        <Button
          type="submit"
          variant="outlined"
          loading={rescheduleMutation.isPending}
          disabled={isReadOnly}
        >
          <i className="mdi mdi-calendar-edit text-base" />
          Request Reschedule
        </Button>
      </form>

      {isReadOnly && (
        <p className="mt-2 text-xs text-text-muted">
          This portal is read-only. Rescheduling is no longer available.
        </p>
      )}
    </div>
  );
}
