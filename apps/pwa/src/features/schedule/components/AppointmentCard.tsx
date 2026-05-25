import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppointmentStatus } from '@properfy/shared';
import { TenantConfirmationBadge } from './TenantConfirmationBadge';
import { FLOW_TYPE_MAP } from '@/lib/status-colors';
import type { InspectorAppointment } from '../types';
import { formatTimeWindow, getTodayLocalISODate, isScheduleRisk } from '../lib/time-slot';

interface AppointmentCardProps {
  appointment: InspectorAppointment;
}

function isT1Warning(appointment: InspectorAppointment): boolean {
  return isScheduleRisk(appointment) && appointment.scheduledDate === getTodayLocalISODate();
}

function getStatusAccent(status: AppointmentStatus): string {
  switch (status) {
    case AppointmentStatus.SCHEDULED:
      return 'border-l-primary';
    case AppointmentStatus.DONE:
      return 'border-l-text-muted';
    case AppointmentStatus.CANCELLED:
    case AppointmentStatus.REJECTED:
      return 'border-l-error';
    default:
      return 'border-l-border-subtle';
  }
}

export const AppointmentCard = memo(function AppointmentCard({ appointment }: AppointmentCardProps) {
  const navigate = useNavigate();
  const showT1Warning = isT1Warning(appointment);
  const flowStyle = FLOW_TYPE_MAP[appointment.flowType];
  const accentClass = getStatusAccent(appointment.status);
  const isDone = appointment.status === AppointmentStatus.DONE;
  const isCancelled =
    appointment.status === AppointmentStatus.CANCELLED ||
    appointment.status === AppointmentStatus.REJECTED;

  const fullAddress = [appointment.propertyAddress, appointment.suburb]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      onClick={() => navigate(`/schedule/${appointment.id}`)}
      className={`w-full overflow-hidden rounded-[20px] border border-black/[0.06] bg-white text-left shadow-[0_8px_24px_rgba(15,23,42,0.07)] transition-shadow hover:shadow-[0_12px_30px_rgba(15,23,42,0.10)] border-l-4 ${accentClass} ${isDone || isCancelled ? 'opacity-60' : ''}`}
      data-testid={`appointment-card-${appointment.id}`}
    >
      {/* Time + warnings header */}
      <div className="flex items-center justify-between gap-2 border-b border-black/[0.05] bg-gray-50 px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 text-sm font-bold text-text-primary">
            {formatTimeWindow(appointment.timeSlot)}
          </span>
          {appointment.isOverdue && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-semibold text-error"
              data-testid="overdue-badge"
            >
              <i className="mdi mdi-clock-alert-outline text-xs" aria-hidden="true" />
              Overdue
            </span>
          )}
          {showT1Warning && !appointment.isOverdue && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning"
              data-testid="t1-warning"
              aria-label="Tenant not confirmed"
            >
              <i className="mdi mdi-alert text-xs" aria-hidden="true" />
              Unconfirmed
            </span>
          )}
        </div>
        <TenantConfirmationBadge status={appointment.tenantConfirmation} />
      </div>

      <div className="px-4 py-3">
        {/* Service type + flow */}
        <div className="flex items-center gap-2">
          <span
            className="shrink-0 rounded bg-secondary/10 px-1.5 py-0.5 text-[11px] font-bold text-secondary"
            data-testid="appointment-code"
          >
            {appointment.appointmentCode}
          </span>
          <span className="text-sm font-bold text-text-primary">{appointment.serviceTypeName}</span>
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: flowStyle.bg, color: flowStyle.text ?? '#333' }}
          >
            {flowStyle.label}
          </span>
        </div>

        {/* Agency name */}
        {appointment.agencyName && (
          <p className="mt-0.5 text-xs text-text-muted" data-testid="agency-name">{appointment.agencyName}</p>
        )}

        {/* Address */}
        <p className="mt-1.5 text-sm leading-5 text-text-secondary">{fullAddress}</p>

        {/* Badges */}
        {(appointment.keyRequired) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {appointment.keyRequired && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                <i className="mdi mdi-key-outline text-xs" aria-hidden="true" />
                Key required
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
});
