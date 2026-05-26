import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createServiceGroupSchema, ServiceGroupExceptionType, todayLocalDateString, currentTimeInTzHHmm } from '@properfy/shared';
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
import type { AppointmentMapItem } from '@/features/appointments/hooks/useAppointmentMapData';

const EXCEPTION_TYPE_OPTIONS = [
  { value: '', label: 'None (standard group)' },
  { value: ServiceGroupExceptionType.LOW_DENSITY_REGION, label: 'Low Density Region (max 30)' },
  { value: ServiceGroupExceptionType.ISOLATED_SERVICE, label: 'Isolated Service (max 3)' },
  { value: ServiceGroupExceptionType.PRIORITY_CLIENT, label: 'Priority Client (max 8)' },
];

interface MapGroupCreateModalProps {
  open: boolean;
  onClose: () => void;
  /** Full appointment objects — tenantId extracted for region resolution. */
  selectedAppointments: AppointmentMapItem[];
  onSuccess: () => void;
}

export function MapGroupCreateModal({
  open,
  onClose,
  selectedAppointments,
  onSuccess,
}: MapGroupCreateModalProps) {
  const selectedAppointmentIds = selectedAppointments.map((a) => a.id);
  // Lasso guarantees same-tenant, so the first item's tenantId is representative.
  const tenantId = selectedAppointments[0]?.tenantId;
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();

  const inferredServiceTypeId = selectedAppointments[0]?.serviceTypeId ?? '';
  const inferredServiceTypeName = selectedAppointments[0]?.serviceTypeName;

  const [name, setName] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [serviceRegionId, setServiceRegionId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState(inferredServiceTypeId);
  const [priorityMode, setPriorityMode] = useState('STANDARD');

  // Sync serviceTypeId if the modal is kept mounted and reopened with different appointments.
  useEffect(() => {
    if (inferredServiceTypeId) setServiceTypeId(inferredServiceTypeId);
  }, [inferredServiceTypeId]);

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

  const today = todayLocalDateString();
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const minStartTime = useMemo(() => scheduledDate === today ? currentTimeInTzHHmm(browserTz) : undefined, [scheduledDate, today, browserTz]);

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
      actorTimezone: browserTz,
    };

    const result = createServiceGroupSchema.safeParse(payload);
    if (!result.success) {
      const firstError = result.error.errors[0];
      if (firstError) {
        showError(`Validation error: ${firstError.path.join('.')} — ${firstError.message}`);
      }
      return;
    }

    const count = selectedAppointmentIds.length;
    const STANDARD_MIN = 5;
    const EXCEPTION_LIMITS: Record<string, number> = {
      LOW_DENSITY_REGION: 30,
      ISOLATED_SERVICE: 3,
      PRIORITY_CLIENT: 8,
    };
    if (!exceptionType && count < STANDARD_MIN) {
      showError(`Standard groups require at least ${STANDARD_MIN} appointments (selected: ${count}). Use an exception type for smaller groups.`);
      return;
    }
    if (exceptionType) {
      const max = EXCEPTION_LIMITS[exceptionType] ?? 30;
      if (count > max) {
        showError(`${exceptionType} exception allows a maximum of ${max} appointments (selected: ${count}).`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const { error: apiError } = await api.POST('/v1/service-groups' as any, { body: result.data as any });
      if (apiError) {
        const env = apiError as { error?: { message?: string; code?: string } };
        showError(env?.error?.message ?? 'Failed to create service group');
        return;
      }
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
          {inferredServiceTypeId ? (
            <div className="flex items-center gap-2 rounded border border-border-subtle bg-gray-50 px-3 py-2 text-sm">
              <span className="font-medium text-text-primary">
                {inferredServiceTypeName
                  ?? serviceTypeOptions.find((o) => o.value === inferredServiceTypeId)?.label
                  ?? inferredServiceTypeId}
              </span>
              <span className="text-xs text-text-tertiary">(from appointments)</span>
            </div>
          ) : (
            <SelectInput
              value={serviceTypeId}
              onChange={setServiceTypeId}
              options={[{ label: 'Select...', value: '' }, ...serviceTypeOptions]}
            />
          )}
        </FormField>

        <FormField label="Scheduled Date" required>
          <DateInput value={scheduledDate} onChange={setScheduledDate} min={today} />
        </FormField>

        <FormField label="Time Window" required>
          <TimeWindowPicker
            startTime={startTime}
            endTime={endTime}
            onStartTimeChange={setStartTime}
            onEndTimeChange={setEndTime}
            minStartTime={minStartTime}
          />
        </FormField>

        <FormField label="Service Region">
          <RegionSelector
            appointmentIds={selectedAppointmentIds}
            selectedRegionId={serviceRegionId}
            onRegionChange={setServiceRegionId}
            tenantId={tenantId}
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
