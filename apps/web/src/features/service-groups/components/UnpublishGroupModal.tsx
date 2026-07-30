import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/forms/Textarea';
import { FormField } from '@/components/forms/FormField';

interface UnpublishGroupModalProps {
  open: boolean;
  onClose: () => void;
  onUnpublish: (reason: string) => void;
  loading?: boolean;
}

/**
 * Confirms `PUBLISHED → DRAFT`. The reason is mandatory because the transition
 * is recorded in the audit trail, matching Cancel/Reject Group.
 */
export function UnpublishGroupModal({ open, onClose, onUnpublish, loading = false }: UnpublishGroupModalProps) {
  const [reason, setReason] = useState('');
  const trimmedReason = reason.trim();

  const handleConfirm = () => {
    if (!trimmedReason) return;
    onUnpublish(trimmedReason);
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
      title="Unpublish Service Group"
      actions={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Keep Published
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!trimmedReason}
            loading={loading}
          >
            Unpublish
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded border border-info/30 bg-info/5 p-3">
        <i className="mdi mdi-information-outline text-lg text-info" aria-hidden="true" />
        <p className="text-sm text-text-primary">
          The group returns to <strong>Draft</strong> and disappears from the inspector
          marketplace. Its appointments stay in the group and keep their{' '}
          <strong>Awaiting Inspector</strong> status, so you can publish it again at any time.
        </p>
      </div>
      <FormField label="Reason" required>
        <Textarea
          value={reason}
          onChange={setReason}
          placeholder="Why is this group coming off the marketplace?"
          rows={3}
          aria-label="Unpublish reason"
        />
      </FormField>
    </Dialog>
  );
}
