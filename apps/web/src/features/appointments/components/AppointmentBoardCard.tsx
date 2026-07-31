import { Link } from 'react-router-dom';
import { formatCivilDate, formatWallTimeRange } from '@/lib/format-date';
import { Tooltip } from '@/components/ui/Tooltip';
import { RentalTenantConfirmationChip } from './RentalTenantConfirmationChip';
import { formatTenantNoteTooltip } from '../lib/tenant-note';
import type { Appointment } from '../types';

export interface BoardCardAction {
  icon: string;
  label: string;
  onClick: () => void;
}

interface AppointmentBoardCardProps {
  appointment: Appointment;
  selected: boolean;
  onToggleSelect?: (id: string) => void;
  /** Quick actions revealed on hover/focus; already filtered by RBAC + status. */
  actions?: BoardCardAction[];
}

/**
 * Dense board card. Status is conveyed by the column, so no status chip here —
 * only the DONE-review and overdue nuances the column cannot express.
 */
export function AppointmentBoardCard({
  appointment,
  selected,
  onToggleSelect,
  actions = [],
}: AppointmentBoardCardProps) {
  const timeRange = formatWallTimeRange(appointment.timeSlotStart, appointment.timeSlotEnd);
  const needsReview = appointment.status === 'DONE' && !appointment.doneCheckedByUserId;

  return (
    <article
      className={`group relative rounded border bg-card-bg p-3 shadow-sm transition focus-within:border-primary hover:border-primary ${
        selected ? 'border-primary ring-1 ring-primary' : 'border-border-subtle'
      }`}
    >
      <div className="flex items-start gap-2">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(appointment.id)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            aria-label={`Select appointment ${appointment.code}`}
          />
        )}
        <Link
          to={`/appointments/${appointment.id}`}
          className="text-sm font-semibold text-secondary hover:underline"
        >
          {appointment.code}
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* `role="img"` on the wrapper, not aria-label on the <i>: a bare <i>
              has no role, so assistive tech may drop the label entirely. */}
          {appointment.isOverdue && (
            <span role="img" aria-label="Overdue" title="Overdue">
              <i className="mdi mdi-alert-circle-outline text-base text-warning" aria-hidden="true" />
            </span>
          )}
          {appointment.hasRentalTenantNote && (
            <Tooltip label={formatTenantNoteTooltip(appointment.rentalTenantNote)}>
              <span role="img" aria-label={formatTenantNoteTooltip(appointment.rentalTenantNote)}>
                <i className="mdi mdi-note-text-outline text-base text-text-secondary" aria-hidden="true" />
              </span>
            </Tooltip>
          )}
          <RentalTenantConfirmationChip status={appointment.rentalTenantConfirmationStatus} />
        </div>
      </div>

      <p className="mt-2 text-sm font-medium text-text-primary">{appointment.serviceTypeName}</p>

      <p className="mt-0.5 text-xs text-text-secondary">
        {formatCivilDate(appointment.scheduledDate)}
        {timeRange ? ` · ${timeRange}` : ''}
      </p>

      {appointment.contactName && (
        <p className="mt-0.5 truncate text-xs text-text-secondary" title={appointment.contactName}>
          {appointment.contactName}
        </p>
      )}

      <p className="mt-0.5 text-xs text-text-muted" title={appointment.propertyAddress}>
        <span className="line-clamp-2">{appointment.propertyAddress}</span>
      </p>

      {appointment.propertyTotalAreaM2 != null && (
        <p className="mt-0.5 text-xs text-text-muted">{appointment.propertyTotalAreaM2} m²</p>
      )}

      {needsReview && (
        <p className="mt-1 text-xs font-semibold text-warning">Review required</p>
      )}

      {actions.length > 0 && (
        // Hidden until hover OR keyboard focus lands inside the card — a
        // hover-only affordance would be unreachable by keyboard.
        <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              aria-label={`${action.label} — appointment ${appointment.code}`}
              title={action.label}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-app-bg hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <i className={`mdi ${action.icon} text-base`} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
