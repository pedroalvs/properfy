import { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/forms/Textarea';
import { FormField } from '@/components/forms/FormField';
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

  const { update, isUpdating } = useUpdateServiceGroup(serviceGroup.id, () => {
    onSaved();
    onClose();
  });

  useEffect(() => {
    if (open) {
      setDescription(serviceGroup.description ?? '');
      setServiceRegionId(serviceGroup.serviceRegionId ?? '');
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

    // Date and time window are NOT edited here — they cascade to every member,
    // so they live in RescheduleGroupModal where the impact is previewed and
    // the operator decides what happens to existing tenant confirmations.
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

      </div>
    </Dialog>
  );
}
