import { useState } from 'react';
import { TenantConfirmationStatus } from '@properfy/shared';
import { Button } from '@/components/ui/Button';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useConfirmAppointment } from '../hooks/usePortalData';
import type { PortalAppointment } from '../types';

interface ConfirmSectionProps {
  appointment: PortalAppointment;
  token: string;
  isReadOnly: boolean;
}

export function ConfirmSection({
  appointment,
  token,
  isReadOnly,
}: ConfirmSectionProps) {
  const { showSuccess, showError } = useSnackbar();
  const confirmMutation = useConfirmAppointment(token);
  const [confirmed, setConfirmed] = useState(false);

  const isAlreadyConfirmed =
    appointment.tenantConfirmationStatus === TenantConfirmationStatus.CONFIRMED;
  const isPending =
    appointment.tenantConfirmationStatus === TenantConfirmationStatus.PENDING;

  if (isAlreadyConfirmed || confirmed) {
    return (
      <div className="rounded bg-card-bg p-6 shadow-sm">
        <div className="flex items-center gap-3 text-success">
          <i className="mdi mdi-check-circle text-2xl" />
          <div>
            <h2 className="text-base font-bold">Attendance Confirmed</h2>
            <p className="text-sm text-text-secondary">
              Your attendance has been confirmed for this inspection.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isPending) {
    return null;
  }

  const handleConfirm = async () => {
    try {
      await confirmMutation.mutateAsync({});
      setConfirmed(true);
      showSuccess('Attendance confirmed successfully.');
    } catch (err) {
      showError(
        err instanceof Error ? err.message : 'Failed to confirm. Please try again.',
      );
    }
  };

  return (
    <div className="rounded bg-card-bg p-6 shadow-sm">
      <h2 className="mb-2 text-base font-bold text-secondary">
        Confirm Your Attendance
      </h2>
      <p className="mb-4 text-sm text-text-secondary">
        Please confirm that you will be available for the scheduled inspection.
      </p>

      <Button
        variant="primary"
        onClick={handleConfirm}
        loading={confirmMutation.isPending}
        disabled={isReadOnly}
      >
        <i className="mdi mdi-check text-base" />
        Confirm Attendance
      </Button>

      {isReadOnly && (
        <p className="mt-2 text-xs text-text-muted">
          This portal is read-only. Confirmation is no longer available.
        </p>
      )}
    </div>
  );
}
