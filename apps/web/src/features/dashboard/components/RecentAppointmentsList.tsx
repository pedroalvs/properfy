import type { RecentAppointment } from '../types';
import { AppointmentStatusChip } from '@/features/appointments/components/AppointmentStatusChip';

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
        <h2 className="text-base font-bold text-secondary">Vistorias Recentes</h2>
      </div>

      {appointments.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-text-muted">
          Nenhuma vistoria recente
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
              <AppointmentStatusChip status={appointment.status} />
              <span className="text-xs text-text-muted ml-auto whitespace-nowrap">
                {appointment.scheduledDate}
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
          Ver todas
        </button>
      </div>
    </div>
  );
}
