import type { RecentAppointment } from '../types';
import { AppointmentStatusChip } from '@/features/appointments/components/AppointmentStatusChip';
import { formatDate } from '@/lib/format-date';

interface RecentAppointmentsListProps {
  appointments: RecentAppointment[];
  onViewAppointment?: (id: string) => void;
  onViewAll?: () => void;
}

export function RecentAppointmentsList({
  appointments,
  onViewAppointment,
  onViewAll,
}: RecentAppointmentsListProps) {
  return (
    <div className="rounded bg-card-bg shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-base font-bold text-secondary">Recent Appointments</h2>
      </div>

      {appointments.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-text-muted">
          No recent appointments
        </div>
      ) : (
        <div>
          {appointments.map((appointment) => (
            <button
              key={appointment.id}
              type="button"
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              onClick={() => onViewAppointment?.(appointment.id)}
              data-testid="appointment-row"
            >
              <span className="text-sm font-bold text-text-primary whitespace-nowrap">
                {appointment.code}
              </span>
              <span className="text-sm text-text-secondary max-w-[200px] truncate">
                {appointment.propertyAddress}
              </span>
              <AppointmentStatusChip
                status={appointment.status}
                doneCheckedByUserId={appointment.doneCheckedByUserId}
              />
              {appointment.status === 'DONE' && !appointment.doneCheckedByUserId && (
                <span className="text-xs font-semibold text-warning whitespace-nowrap">
                  Pending review
                </span>
              )}
              <span className="text-xs text-text-muted ml-auto whitespace-nowrap">
                {/* UX-baseline cleanup: format ISO via the shared
                    `formatDate` helper so the dashboard surfaces the
                    locale-friendly date instead of the raw ISO. */}
                {formatDate(appointment.scheduledDate)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="px-4 py-3 border-t border-gray-100">
        <button
          type="button"
          className="text-sm text-primary font-semibold"
          onClick={onViewAll}
        >
          View all
        </button>
      </div>
    </div>
  );
}
