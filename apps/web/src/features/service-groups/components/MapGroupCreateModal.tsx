import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createServiceGroupSchema, currentTimeInTzHHmm, todayInTzDateString, PLATFORM_TIMEZONE } from '@properfy/shared';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/forms/FormField';
import { DateInput } from '@/components/forms/DateInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { Textarea } from '@/components/forms/Textarea';
import { Button } from '@/components/ui/Button';
import { RegionSelector } from './RegionSelector';
import { TimeWindowPicker } from './TimeWindowPicker';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useFormOptions } from '@/hooks/useFormOptions';
import { api } from '@/services/api';
import type { AppointmentMapItem } from '@/features/appointments/hooks/useAppointmentMapData';

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
  // Groups may span agencies. A single group-level region only applies to a
  // single-agency group; mixed-agency groups rely on per-appointment region
  // matching in the marketplace, so the region selector is hidden for them.
  const distinctTenantIds = [...new Set(selectedAppointments.map((a) => a.tenantId).filter(Boolean))];
  const isMixedAgency = distinctTenantIds.length > 1;
  const tenantId = isMixedAgency ? undefined : distinctTenantIds[0];
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();

  const inferredServiceTypeId = selectedAppointments[0]?.serviceTypeId ?? '';
  const inferredServiceTypeName = selectedAppointments[0]?.serviceTypeName;

  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [serviceRegionId, setServiceRegionId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState(inferredServiceTypeId);

  // Sync serviceTypeId if the modal is kept mounted and reopened with different appointments.
  useEffect(() => {
    if (inferredServiceTypeId) setServiceTypeId(inferredServiceTypeId);
  }, [inferredServiceTypeId]);

  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { options: serviceTypeOptions } = useFormOptions<{ id: string; name: string }>(
    ['service-types', 'group-create-modal'],
    '/v1/service-types',
    (item) => ({ value: item.id, label: item.name }),
    { status: 'ACTIVE' },
  );

  const today = todayInTzDateString(PLATFORM_TIMEZONE);
  const minStartTime = useMemo(() => scheduledDate === today ? currentTimeInTzHHmm(PLATFORM_TIMEZONE) : undefined, [scheduledDate, today]);

  const handleSubmit = useCallback(async () => {
    const timeWindow = `${startTime}-${endTime}`;
    const payload: Record<string, unknown> = {
      appointmentIds: selectedAppointmentIds,
      serviceTypeId,
      scheduledDate,
      timeWindow,
      ...(serviceRegionId && !isMixedAgency ? { serviceRegionId } : {}),
      ...(description ? { description } : {}),
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
      const { data, error: apiError } = await api.POST('/v1/service-groups' as any, { body: result.data as any });
      if (apiError) {
        const env = apiError as { error?: { message?: string; code?: string } };
        showError(env?.error?.message ?? 'Failed to create service group');
        return;
      }
      const groupCode = (data as { data?: { code?: string } } | undefined)?.data?.code;
      showSuccess(groupCode ? `Service group ${groupCode} created successfully` : 'Service group created successfully');
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
    serviceRegionId, isMixedAgency, description,
    showSuccess, showError, queryClient, onSuccess,
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
          {isMixedAgency ? (
            <div className="rounded border border-border-subtle bg-gray-50 px-3 py-2 text-sm text-text-secondary">
              This group spans {distinctTenantIds.length} agencies — no group region is set;
              inspectors are matched per property.
            </div>
          ) : (
            <RegionSelector
              appointmentIds={selectedAppointmentIds}
              selectedRegionId={serviceRegionId}
              onRegionChange={setServiceRegionId}
              tenantId={tenantId}
            />
          )}
        </FormField>

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
