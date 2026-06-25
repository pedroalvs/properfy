import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/forms/Textarea';
import { FormField } from '@/components/forms/FormField';

interface CancelGroupModalProps {
  open: boolean;
  onClose: () => void;
  onCancel: (reason: string) => void;
  serviceGroupId: string;
}

export function CancelGroupModal({ open, onClose, onCancel, serviceGroupId: _serviceGroupId }: CancelGroupModalProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (reason.trim()) {
      onCancel(reason.trim());
      setReason('');
    }
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Cancel Service Group"
      actions={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Keep Group
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!reason.trim()}
            className="!bg-error"
          >
            Cancel Group
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded border border-warning/30 bg-warning/5 p-3">
        <i className="mdi mdi-alert-outline text-lg text-warning" aria-hidden="true" />
        <p className="text-sm text-text-primary">
          This action will cancel the service group and release all associated appointments.
          This cannot be undone easily.
        </p>
      </div>
      <FormField label="Reason" required>
        <Textarea
          value={reason}
          onChange={setReason}
          placeholder="Provide a reason for cancellation"
          rows={3}
          aria-label="Cancellation reason"
        />
      </FormField>
    </Dialog>
  );
}
