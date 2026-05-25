import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/forms/Textarea';
import { FormField } from '@/components/forms/FormField';

interface RepublishGroupModalProps {
  open: boolean;
  onClose: () => void;
  onRepublish: (reason?: string) => void;
  serviceGroupId: string;
}

export function RepublishGroupModal({ open, onClose, onRepublish, serviceGroupId: _serviceGroupId }: RepublishGroupModalProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    onRepublish(reason.trim() || undefined);
    setReason('');
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Republish Service Group"
      actions={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConfirm}>
            Republish
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded border border-info/30 bg-info/5 p-3">
        <i className="mdi mdi-information-outline text-lg text-info" aria-hidden="true" />
        <p className="text-sm text-text-primary">
          This will move the service group back to DRAFT status and clear the inspector assignment.
          You can then edit and re-publish it.
        </p>
      </div>
      <FormField label="Reason">
        <Textarea
          value={reason}
          onChange={setReason}
          placeholder="Optionally provide a reason for republishing"
          rows={3}
          aria-label="Republish reason"
        />
      </FormField>
    </Dialog>
  );
}
