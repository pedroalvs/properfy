import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppointmentStatus } from '@properfy/shared';
import { StatusChip } from '@/components/ui/StatusChip';
import { TenantConfirmationBadge } from './TenantConfirmationBadge';
import { FLOW_TYPE_MAP } from '@/lib/status-colors';
import type { InspectorAppointment } from '../types';
import { getTimeWindowParts, getTodayLocalISODate, isScheduleRisk } from '../lib/time-slot';

interface AppointmentCardProps {
  appointment: InspectorAppointment;
}

function isT1Warning(appointment: InspectorAppointment): boolean {
  return isScheduleRisk(appointment) && appointment.scheduledDate === getTodayLocalISODate();
}

function getLeftBorderClass(status: AppointmentStatus): string {
  switch (status) {
    case AppointmentStatus.SCHEDULED:
      return 'border-l-4 border-l-primary';
    case AppointmentStatus.DONE:
      return 'border-l-4 border-l-text-muted';
    case AppointmentStatus.CANCELLED:
    case AppointmentStatus.REJECTED:
      return 'border-l-4 border-l-error';
    default:
      return 'border-l-4 border-l-border-subtle';
  }
}

export const AppointmentCard = memo(function AppointmentCard({ appointment }: AppointmentCardProps) {
  const navigate = useNavigate();
  const showWarning = isT1Warning(appointment);
  const flowStyle = FLOW_TYPE_MAP[appointment.flowType];
  const leftBorder = getLeftBorderClass(appointment.status);
  const { startTime } = getTimeWindowParts(appointment.timeSlot);

  return (
    <button
      onClick={() => navigate(`/schedule/${appointment.id}`)}
      className={`w-full rounded-[24px] border border-white/70 bg-white/92 p-4 text-left shadow-[0_14px_30px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_18px_36px_rgba(15,23,42,0.10)] ${leftBorder}`}
      data-testid={`appointment-card-${appointment.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-app-bg px-2.5 py-1 text-sm font-bold text-text-primary">{startTime}</span>
          {showWarning && (
            <i
              className="mdi mdi-alert text-warning"
              aria-label="Tenant not confirmed for today"
              data-testid="t1-warning"
            />
          )}
        </div>
        <StatusChip status={appointment.status} />
      </div>

      <p className="mt-3 text-sm leading-5 text-text-primary">{appointment.propertyAddress}</p>
      <p className="text-xs text-text-secondary">{appointment.suburb}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusChip label={flowStyle.label} bg={flowStyle.bg} />
        <TenantConfirmationBadge status={appointment.tenantConfirmation} />
        {appointment.keyRequired && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-text-secondary">
            <i className="mdi mdi-key text-xs" aria-hidden="true" />
            Key
          </span>
        )}
      </div>
    </button>
  );
});
