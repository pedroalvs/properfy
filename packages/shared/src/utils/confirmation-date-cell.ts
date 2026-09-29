import { formatInstantDate } from './format-display-date';
import { suppressesOccupantNotifications } from './non-notifying-flow-types';

/**
 * Renders the "Confirmation Date" cell for an appointment export/report.
 *
 * The tenant-confirmation timestamp lives on the active confirmation cycle
 * (`AppointmentConfirmationCycle.confirmed_at`), not on the appointment.
 *
 * - Flow types with no occupant to confirm (Ingoing/Outgoing) never carry a
 *   confirmation — `SCHEDULED` is already their operational confirmation — so
 *   the cell reads `N/A`. Reuses `suppressesOccupantNotifications` (an allowlist,
 *   fail-open) so this stays in lockstep with the notification-suppression rule.
 * - A Routine appointment that has been confirmed shows the confirmation date.
 * - A Routine appointment still pending shows blank; the separate `Confirmation`
 *   (status) column already reports `PENDING`.
 */
export function formatConfirmationDateCell(
  flowType: string | null | undefined,
  confirmedAt: Date | string | null | undefined,
): string {
  if (suppressesOccupantNotifications(flowType)) return 'N/A';
  return formatInstantDate(confirmedAt);
}
