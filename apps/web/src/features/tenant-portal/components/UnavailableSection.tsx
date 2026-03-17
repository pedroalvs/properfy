import { useState } from 'react';
import { TenantConfirmationStatus } from '@properfy/shared';
import { Button } from '@/components/ui/Button';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useReportUnavailability } from '../hooks/usePortalData';
import type { PortalAppointment } from '../types';

interface UnavailableSectionProps {
  appointment: PortalAppointment;
  token: string;
  isReadOnly: boolean;
}

export function UnavailableSection({
  appointment,
  token,
  isReadOnly,
}: UnavailableSectionProps) {
  const { showSuccess, showError } = useSnackbar();
  const unavailableMutation = useReportUnavailability(token);
  const [reported, setReported] = useState(false);

  const isAlreadyUnavailable =
    appointment.tenantConfirmationStatus === TenantConfirmationStatus.UNAVAILABLE;

  if (isAlreadyUnavailable || reported) {
    return (
      <div className="rounded bg-card-bg p-6 shadow-sm">
        <div className="flex items-center gap-3 text-warning">
          <i className="mdi mdi-calendar-remove text-2xl" />
          <div>
            <h2 className="text-base font-bold">Unavailability Reported</h2>
            <p className="text-sm text-text-secondary">
              Your unavailability has been recorded. The team will follow up.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleReport = async () => {
    try {
      await unavailableMutation.mutateAsync({});
      setReported(true);
      showSuccess('Unavailability reported successfully.');
    } catch (err) {
      showError(
        err instanceof Error ? err.message : 'Failed to report unavailability.',
      );
    }
  };

  // Unavailability can be reported even in read-only mode (urgent mode)
  return (
    <div className="rounded bg-card-bg p-6 shadow-sm">
      <h2 className="mb-2 text-base font-bold text-secondary">
        Report Unavailability
      </h2>
      <p className="mb-4 text-sm text-text-secondary">
        {isReadOnly
          ? 'Even though the portal has expired, you can still report unavailability as an urgent request.'
          : "If you won't be available for this inspection, let us know."}
      </p>

      <Button
        variant="outlined"
        onClick={handleReport}
        loading={unavailableMutation.isPending}
      >
        <i className="mdi mdi-calendar-remove text-base" />
        {isReadOnly ? 'Report Unavailability (Urgent)' : 'Report Unavailability'}
      </Button>
    </div>
  );
}
