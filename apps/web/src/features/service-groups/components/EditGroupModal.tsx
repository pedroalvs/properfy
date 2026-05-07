import { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/forms/TextInput';
import { Textarea } from '@/components/forms/Textarea';
import { FormField } from '@/components/forms/FormField';
import { PriorityModeSelect } from './PriorityModeSelect';
import { TimeWindowPicker } from './TimeWindowPicker';
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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [priorityMode, setPriorityMode] = useState('STANDARD');

  const { update, isUpdating } = useUpdateServiceGroup(serviceGroup.id, () => {
    onSaved();
    onClose();
  });

  useEffect(() => {
    if (open) {
      setName(serviceGroup.name ?? '');
      setDescription(serviceGroup.description ?? '');
      setScheduledDate('');
      setStartTime('');
      setEndTime('');
      setPriorityMode(serviceGroup.priorityMode ?? 'STANDARD');
    }
  }, [open, serviceGroup]);

  const handleSave = () => {
    const data: UpdateServiceGroupData = {};

    if (name.trim()) {
      data.name = name.trim();
    }

    if (description.trim()) {
      data.description = description.trim();
    }

    if (scheduledDate) {
      data.scheduledDate = scheduledDate;
    }

    if (startTime && endTime) {
      data.timeWindow = `${startTime}-${endTime}`;
    }

    if (priorityMode) {
      data.priorityMode = priorityMode as 'STANDARD' | 'PRIORITY_24H';
    }

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
        <FormField label="Name" required>
          <TextInput
            value={name}
            onChange={setName}
            placeholder="Service group name"
            aria-label="Service group name"
          />
        </FormField>

        <FormField label="Description">
          <Textarea
            value={description}
            onChange={setDescription}
            placeholder="Optional description"
            rows={3}
            aria-label="Service group description"
          />
        </FormField>

        {serviceGroup.status === 'DRAFT' && (
          <>
            <FormField label="Scheduled Date">
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
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
              />
            </FormField>

            <PriorityModeSelect value={priorityMode} onChange={setPriorityMode} />
          </>
        )}
      </div>
    </Dialog>
  );
}
