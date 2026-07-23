import { formatDate } from '@/lib/format-date';
import type { PortalAppointment } from '../types';

interface BookedSlotCardProps {
  appointment: PortalAppointment;
  /** Renders the "Change time" link when provided. */
  onChangeTime?: () => void;
}

/**
 * Hero block of the portal: the booked date/time in a coral highlight box
 * with the "Change time" entry point.
 */
export function BookedSlotCard({ appointment, onChangeTime }: BookedSlotCardProps) {
  return (
    <div className="text-center">
      <p className="text-xs font-bold uppercase tracking-wide text-text-muted">
        Booked for
      </p>
      <div className="mt-2 rounded-xl border border-[color-mix(in_srgb,var(--color-real-estate)_45%,white)] bg-[color-mix(in_srgb,var(--color-real-estate)_12%,white)] px-4 py-4">
        <p className="text-sm font-bold text-secondary">
          {formatDate(appointment.scheduledDate)}
        </p>
        <p className="mt-0.5 text-xl font-extrabold text-[color-mix(in_srgb,var(--color-real-estate)_85%,black)]">
          {appointment.timeSlotStart} – {appointment.timeSlotEnd}
        </p>
        {onChangeTime && (
          <button
            type="button"
            onClick={onChangeTime}
            className="mt-2 border-b border-[color-mix(in_srgb,var(--color-real-estate)_45%,white)] text-sm font-bold text-real-estate hover:text-[color-mix(in_srgb,var(--color-real-estate)_85%,black)]"
          >
            Change time
          </button>
        )}
      </div>
    </div>
  );
}
