import { useState, useCallback } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useScheduledReportMutations } from '../hooks/useScheduledReportMutations';
import type { ScheduledReport } from '../types';

interface ReassignOwnershipModalProps {
  open: boolean;
  onClose: () => void;
  schedule: ScheduledReport | null;
  onReassigned: () => void;
}

/**
 * Feature 019 T093: AM-only modal to reassign schedule ownership.
 * The backend validates that the new owner has compatible permissions.
 */
export function ReassignOwnershipModal({
  open,
  onClose,
  schedule,
  onReassigned,
}: ReassignOwnershipModalProps) {
  const { reassignScheduleOwnership, isMutating } = useScheduledReportMutations();
  const { showSuccess, showError } = useSnackbar();
  const [newOwnerUserId, setNewOwnerUserId] = useState('');
  const [error, setError] = useState('');

  const handleClose = useCallback(() => {
    setNewOwnerUserId('');
    setError('');
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!schedule) return;
    if (!newOwnerUserId.trim()) {
      setError('Required field');
      return;
    }
    const result = await reassignScheduleOwnership(schedule.id, newOwnerUserId.trim());
    if (result.success) {
      showSuccess('Ownership reassigned');
      setNewOwnerUserId('');
      setError('');
      onReassigned();
    } else {
      showError(result.error ?? 'Failed to reassign');
    }
  }, [schedule, newOwnerUserId, reassignScheduleOwnership, showSuccess, showError, onReassigned]);

  if (!schedule) return null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Reassign ownership"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">
          Reassign ownership of{' '}
          <strong>{schedule.displayName ?? schedule.reportType}</strong> to another user.
          The new owner must have compatible permissions for this report type.
        </p>

        <FormField label="New owner user ID" required error={error}>
          <TextInput
            value={newOwnerUserId}
            onChange={(v) => {
              setNewOwnerUserId(v);
              if (v.trim()) setError('');
            }}
            placeholder="Enter user ID"
            error={!!error}
            aria-label="New owner user ID"
          />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={isMutating} onClick={handleSubmit}>
            Reassign
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
