import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/forms/Textarea';
import { FormField } from '@/components/forms/FormField';

interface RejectGroupModalProps {
  open: boolean;
  onClose: () => void;
  onReject: (reason: string) => void;
  serviceGroupId: string;
}

export function RejectGroupModal({ open, onClose, onReject, serviceGroupId: _serviceGroupId }: RejectGroupModalProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (reason.trim()) {
      onReject(reason.trim());
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
      title="Reject Service Group"
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
            Reject Group
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded border border-warning/30 bg-warning/5 p-3">
        <i className="mdi mdi-alert-outline text-lg text-warning" aria-hidden="true" />
        <p className="text-sm text-text-primary">
          This action will reject the service group. All associated appointments will be unlinked
          and any SCHEDULED appointments will be reverted to AWAITING_INSPECTOR.
        </p>
      </div>
      <FormField label="Reason" required>
        <Textarea
          value={reason}
          onChange={setReason}
          placeholder="Provide a reason for rejection"
          rows={3}
          aria-label="Rejection reason"
        />
      </FormField>
    </Dialog>
  );
}
