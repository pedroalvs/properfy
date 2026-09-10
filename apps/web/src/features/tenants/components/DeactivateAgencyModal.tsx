import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/forms/Textarea';
import { FormField } from '@/components/forms/FormField';

interface DeactivateAgencyModalProps {
  open: boolean;
  agencyName: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export function DeactivateAgencyModal({
  open,
  agencyName,
  loading,
  onClose,
  onConfirm,
}: DeactivateAgencyModalProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (reason.trim()) {
      onConfirm(reason.trim());
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
      title="Deactivate Agency"
      actions={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!reason.trim() || loading}
            loading={loading}
            className="!bg-error"
          >
            Deactivate
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded border border-warning/30 bg-warning/5 p-3">
        <i className="mdi mdi-alert-outline text-lg text-warning" aria-hidden="true" />
        <p className="text-sm text-text-primary">
          You are about to deactivate <strong>{agencyName}</strong>. This will affect all
          associated branches and appointments. This action cannot be easily undone.
        </p>
      </div>
      <FormField label="Reason" required>
        <Textarea
          value={reason}
          onChange={setReason}
          placeholder="Provide a reason for deactivation"
          rows={3}
          maxLength={500}
          aria-label="Deactivation reason"
        />
      </FormField>
    </Dialog>
  );
}
