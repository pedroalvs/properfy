import { useState, useEffect } from 'react';
import { todayLocalDateString, currentTimeInTzHHmm } from '@properfy/shared';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/forms/Textarea';
import { FormField } from '@/components/forms/FormField';
import { TimeWindowPicker } from './TimeWindowPicker';
import { RegionSelector } from './RegionSelector';
import { useUpdateServiceGroup } from '../hooks/useUpdateServiceGroup';
import type { ServiceGroupDetail } from '../types';
import type { UpdateServiceGroupData } from '../hooks/useUpdateServiceGroup';

interface EditGroupModalProps {
  open: boolean;
  onClose: () => void;
  serviceGroup: ServiceGroupDetail;
  onSaved: () => void;
}

export function EditGroupModal({ open, onClose, serviceGroup, onSaved }: EditGroupModalProps) {
  const [description, setDescription] = useState('');
  const [serviceRegionId, setServiceRegionId] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const { update, isUpdating } = useUpdateServiceGroup(serviceGroup.id, () => {
    onSaved();
    onClose();
  });

  useEffect(() => {
    if (open) {
      setDescription(serviceGroup.description ?? '');
      setServiceRegionId(serviceGroup.serviceRegionId ?? '');
      setScheduledDate('');
      setStartTime('');
      setEndTime('');
    }
  }, [open, serviceGroup]);

  const handleSave = () => {
    const data: UpdateServiceGroupData = {};

    if (description.trim()) {
      data.description = description.trim();
    }

    // Only send the region when it actually changed; '' clears it (sends null).
    const initialRegionId = serviceGroup.serviceRegionId ?? '';
    if (serviceRegionId !== initialRegionId) {
      data.serviceRegionId = serviceRegionId || null;
    }

    if (scheduledDate) {
      data.scheduledDate = scheduledDate;
    }

    if (startTime && endTime) {
      data.timeWindow = `${startTime}-${endTime}`;
    }

    data.actorTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    update(data);
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Edit Service Group"
      maxWidth="600px"
      actions={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} loading={isUpdating}>
            Save Changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Description">
          <Textarea
            value={description}
            onChange={setDescription}
            placeholder="Optional description"
            rows={3}
            aria-label="Service group description"
          />
        </FormField>

        <RegionSelector
          appointmentIds={(serviceGroup.appointments ?? []).map((a) => a.id)}
          selectedRegionId={serviceRegionId}
          onRegionChange={setServiceRegionId}
          tenantId={serviceGroup.tenantId ?? undefined}
          hint="Change the target region for this group. Required before publishing."
        />

        {serviceGroup.status === 'DRAFT' && (
          <>
            <FormField label="Scheduled Date">
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                // Edit-conditional: always enforce min when editing (service groups start fresh).
                min={todayLocalDateString()}
                className="w-full rounded border border-border-subtle bg-white px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                aria-label="Scheduled date"
              />
            </FormField>

            <FormField label="Time Window">
              <TimeWindowPicker
                startTime={startTime}
                endTime={endTime}
                onStartTimeChange={setStartTime}
                onEndTimeChange={setEndTime}
                minStartTime={scheduledDate === todayLocalDateString() ? currentTimeInTzHHmm(Intl.DateTimeFormat().resolvedOptions().timeZone) : undefined}
              />
            </FormField>
          </>
        )}
      </div>
    </Dialog>
  );
}
