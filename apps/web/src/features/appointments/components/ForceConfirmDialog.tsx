import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/forms/Textarea';
import { FormField } from '@/components/forms/FormField';

interface ForceConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export function ForceConfirmDialog({ open, onClose, onConfirm }: ForceConfirmDialogProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (reason.trim()) {
      onConfirm(reason.trim());
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
      title="Force Tenant Confirmation"
      actions={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!reason.trim()}
            className="!bg-warning"
          >
            Force Confirm
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded border border-warning/30 bg-warning/5 p-3">
        <i className="mdi mdi-alert-outline text-lg text-warning" aria-hidden="true" />
        <p className="text-sm text-text-primary">
          This will override the tenant confirmation status to CONFIRMED without their direct action.
          Use only when manual verification has been obtained.
        </p>
      </div>
      <FormField label="Reason" required>
        <Textarea
          value={reason}
          onChange={setReason}
          placeholder="Provide a reason for forcing confirmation"
          rows={3}
          aria-label="Force confirmation reason"
        />
      </FormField>
    </Dialog>
  );
}
