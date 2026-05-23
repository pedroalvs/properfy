import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createServiceGroupSchema, ServiceGroupExceptionType } from '@properfy/shared';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { DateInput } from '@/components/forms/DateInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { Textarea } from '@/components/forms/Textarea';
import { Button } from '@/components/ui/Button';
import { RegionSelector } from './RegionSelector';
import { TimeWindowPicker } from './TimeWindowPicker';
import { PriorityModeSelect } from './PriorityModeSelect';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useFormOptions } from '@/hooks/useFormOptions';
import { api } from '@/services/api';

const EXCEPTION_TYPE_OPTIONS = [
  { value: '', label: 'None (standard group)' },
  { value: ServiceGroupExceptionType.LOW_DENSITY_REGION, label: 'Low Density Region (max 30)' },
  { value: ServiceGroupExceptionType.ISOLATED_SERVICE, label: 'Isolated Service (max 3)' },
  { value: ServiceGroupExceptionType.PRIORITY_CLIENT, label: 'Priority Client (max 8)' },
];

interface MapGroupCreateModalProps {
  open: boolean;
  onClose: () => void;
  selectedAppointmentIds: string[];
  onSuccess: () => void;
}

export function MapGroupCreateModal({
  open,
  onClose,
  selectedAppointmentIds,
  onSuccess,
}: MapGroupCreateModalProps) {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();

  const [name, setName] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [serviceRegionId, setServiceRegionId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [priorityMode, setPriorityMode] = useState('STANDARD');
  const [description, setDescription] = useState('');
  const [exceptionType, setExceptionType] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { options: serviceTypeOptions } = useFormOptions<{ id: string; name: string }>(
    ['service-types', 'group-create-modal'],
    '/v1/service-types',
    (item) => ({ value: item.id, label: item.name }),
    { status: 'ACTIVE' },
  );

  const handleSubmit = useCallback(async () => {
    const timeWindow = `${startTime}-${endTime}`;
    const payload: Record<string, unknown> = {
      appointmentIds: selectedAppointmentIds,
      serviceTypeId,
      scheduledDate,
      timeWindow,
      ...(serviceRegionId ? { serviceRegionId } : {}),
      priorityMode,
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
      ...(exceptionType ? { exceptionType, exceptionReason } : {}),
    };

    const result = createServiceGroupSchema.safeParse(payload);
    if (!result.success) {
      const firstError = result.error.errors[0];
      if (firstError) {
        showError(`Validation error: ${firstError.path.join('.')} — ${firstError.message}`);
      }
      return;
    }

    setSubmitting(true);
    try {
      await api.POST('/v1/service-groups' as any, { body: result.data as any });
      showSuccess('Service group created successfully');
      queryClient.invalidateQueries({ queryKey: ['service-groups'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      onSuccess();
    } catch (err: any) {
      showError(err?.message ?? 'Failed to create service group');
    } finally {
      setSubmitting(false);
    }
  }, [
    selectedAppointmentIds, serviceTypeId, scheduledDate, startTime, endTime,
    serviceRegionId, priorityMode, name, description, exceptionType,
    exceptionReason, showSuccess, showError, queryClient, onSuccess,
  ]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Create Service Group (${selectedAppointmentIds.length} appointments)`}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting || !serviceTypeId || !scheduledDate}
            loading={submitting}
          >
            Create Group
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Name">
          <TextInput value={name} onChange={setName} placeholder="Group name" />
        </FormField>

        <FormField label="Service Type" required>
          <SelectInput
            value={serviceTypeId}
            onChange={setServiceTypeId}
            options={[{ label: 'Select...', value: '' }, ...serviceTypeOptions]}
          />
        </FormField>

        <FormField label="Scheduled Date" required>
          <DateInput value={scheduledDate} onChange={setScheduledDate} />
        </FormField>

        <FormField label="Time Window" required>
          <TimeWindowPicker
            startTime={startTime}
            endTime={endTime}
            onStartTimeChange={setStartTime}
            onEndTimeChange={setEndTime}
          />
        </FormField>

        <FormField label="Service Region">
          <RegionSelector
            appointmentIds={selectedAppointmentIds}
            selectedRegionId={serviceRegionId}
            onRegionChange={setServiceRegionId}
          />
        </FormField>

        <FormField label="Priority">
          <PriorityModeSelect value={priorityMode} onChange={setPriorityMode} />
        </FormField>

        <FormField label="Exception Type">
          <SelectInput
            value={exceptionType}
            onChange={setExceptionType}
            options={EXCEPTION_TYPE_OPTIONS}
          />
        </FormField>

        {exceptionType && (
          <FormField label="Exception Reason" required>
            <Textarea
              value={exceptionReason}
              onChange={setExceptionReason}
              placeholder="Explain why this group requires an exception..."
              rows={3}
            />
          </FormField>
        )}

        <FormField label="Description">
          <Textarea
            value={description}
            onChange={setDescription}
            placeholder="Optional description..."
            rows={2}
          />
        </FormField>
      </div>
    </Dialog>
  );
}
