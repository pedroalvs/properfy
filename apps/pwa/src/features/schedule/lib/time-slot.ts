import { ServiceTypeFlowType, RentalTenantConfirmationStatus, formatWallTimeRange } from '@properfy/shared';
import type { InspectorAppointment } from '../types';

export function parseScheduleDate(dateStr: string): Date {
  // Slice first: the service worker caches /v1/inspector/schedule for 24h, so
  // after an update a still-offline device can be served a pre-contract body
  // where scheduledDate is a full ISO stamp. Concatenating 'T12:00:00' onto
  // that yields an Invalid Date and the schedule headers render "Invalid Date".
  // Noon anchor keeps the day stable against any device UTC offset.
  return new Date(`${dateStr.slice(0, 10)}T12:00:00`);
}

export function formatScheduleDate(dateStr: string): string {
  return parseScheduleDate(dateStr).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatTimeWindow(start: string, end: string): string {
  return formatWallTimeRange(start, end);
}

export function isScheduleRisk(appointment: Pick<
  InspectorAppointment,
  'flowType' | 'keyRequired' | 'rentalTenantConfirmation'
>): boolean {
  if (appointment.flowType !== ServiceTypeFlowType.ROUTINE) return false;
  if (appointment.keyRequired) return false;
  return appointment.rentalTenantConfirmation !== RentalTenantConfirmationStatus.CONFIRMED;
}
