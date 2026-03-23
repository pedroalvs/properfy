import { AppointmentStatusChip } from '@/features/appointments/components/AppointmentStatusChip';
import { formatDate } from '@/lib/format-date';
import { TENANT_CONFIRMATION_STATUS_MAP } from '@/lib/status-colors';
import { useCountdown } from '../hooks/useCountdown';
import type { PortalAppointment } from '../types';

interface AppointmentInfoCardProps {
  appointment: PortalAppointment;
  deadline?: string;
  onDeadlineExpire?: () => void;
}

export function AppointmentInfoCard({ appointment, deadline, onDeadlineExpire }: AppointmentInfoCardProps) {
  const confirmationStyle =
    TENANT_CONFIRMATION_STATUS_MAP[appointment.tenantConfirmationStatus];
  const countdown = useCountdown(deadline, onDeadlineExpire);

  return (
    <div className="rounded bg-card-bg p-6 shadow-sm">
      <h2 className="mb-4 text-base font-bold text-secondary">
        Appointment Details
      </h2>

      <div className="space-y-3 text-sm">
        <InfoRow label="Status">
          <AppointmentStatusChip status={appointment.status} />
        </InfoRow>

        <InfoRow label="Scheduled Date">
          {formatDate(appointment.scheduledDate)}
        </InfoRow>

        <InfoRow label="Time Slot">{appointment.timeSlot}</InfoRow>

        <InfoRow label="Confirmation">
          <span
            className="inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5"
            style={{
              backgroundColor: confirmationStyle.bg,
              color: confirmationStyle.text,
            }}
          >
            {confirmationStyle.label}
          </span>
        </InfoRow>

        {appointment.keyRequired && (
          <InfoRow label="Key Required">
            <span className="inline-flex items-center gap-1 text-warning">
              <i className="mdi mdi-key text-base" />
              Yes
            </span>
          </InfoRow>
        )}

        {appointment.meetingLocation && (
          <InfoRow label="Meeting Location">
            {appointment.meetingLocation}
          </InfoRow>
        )}

        {appointment.notes && (
          <InfoRow label="Notes">{appointment.notes}</InfoRow>
        )}
      </div>

      {deadline && countdown.isUrgent && !countdown.isExpired && (
        <div
          className={`mt-4 flex items-center gap-2 rounded px-3 py-2 text-sm font-semibold ${
            countdown.isCritical
              ? 'bg-error/10 text-error'
              : 'bg-warning/10 text-warning'
          }`}
          role="status"
          aria-label="Countdown timer"
        >
          <i className="mdi mdi-clock-alert-outline text-base" />
          {countdown.label}
        </div>
      )}
    </div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="font-medium text-text-secondary">{label}</span>
      <span className="text-right text-text-primary">{children}</span>
    </div>
  );
}

