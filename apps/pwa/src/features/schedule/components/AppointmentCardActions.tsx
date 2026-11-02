import {
  AppointmentActionBar,
  appointmentToActionTarget,
} from '@/features/execution/components/AppointmentActionBar';
import type { InspectorAppointment } from '../types';

interface AppointmentCardActionsProps {
  appointment: InspectorAppointment;
  /** Whether the appointment is dated today (gate for Check in / Running late). */
  isToday: boolean;
}

/**
 * Thin adapter kept for the schedule card: maps the appointment to the shared
 * {@link ExecutionActionTarget} and renders the extracted {@link AppointmentActionBar}.
 * Behaviour is unchanged — the Today screen reuses the same bar.
 */
export function AppointmentCardActions({ appointment, isToday }: AppointmentCardActionsProps) {
  return <AppointmentActionBar target={appointmentToActionTarget(appointment)} isToday={isToday} />;
}
