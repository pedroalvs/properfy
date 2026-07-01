import { ServiceTypeFlowType, RentalTenantConfirmationStatus } from '@properfy/shared';
import type { InspectorAppointment } from '../types';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function toLocalISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getTodayLocalISODate(now: Date = new Date()): string {
  return toLocalISODate(now);
}

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

export function getScheduleStartDateTime(scheduledDate: string, start: string): Date {
  return new Date(`${scheduledDate}T${start}:00`);
}

export function isScheduleRisk(appointment: Pick<
  InspectorAppointment,
  'flowType' | 'keyRequired' | 'rentalTenantConfirmation'
>): boolean {
  if (appointment.flowType !== ServiceTypeFlowType.ROUTINE) return false;
  if (appointment.keyRequired) return false;
  return appointment.rentalTenantConfirmation !== RentalTenantConfirmationStatus.CONFIRMED;
}
