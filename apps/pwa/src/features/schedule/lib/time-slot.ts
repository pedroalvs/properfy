import { ServiceTypeFlowType, RentalTenantConfirmationStatus } from '@properfy/shared';
import type { InspectorAppointment } from '../types';

export function parseScheduleDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`);
}

export function formatScheduleDate(dateStr: string): string {
  return parseScheduleDate(dateStr).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatTimeWindow(start: string, end: string): string {
  return `${start} – ${end}`;
}

export function isScheduleRisk(appointment: Pick<
  InspectorAppointment,
  'flowType' | 'keyRequired' | 'rentalTenantConfirmation'
>): boolean {
  if (appointment.flowType !== ServiceTypeFlowType.ROUTINE) return false;
  if (appointment.keyRequired) return false;
  return appointment.rentalTenantConfirmation !== RentalTenantConfirmationStatus.CONFIRMED;
}
