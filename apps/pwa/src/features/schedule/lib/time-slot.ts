import { ServiceTypeFlowType, TenantConfirmationStatus } from '@properfy/shared';
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

export function getTimeWindowParts(timeSlot: string): { startTime: string; endTime: string } {
  const [startTime = '00:00', endTime = '00:00'] = timeSlot.split('-');
  return { startTime, endTime };
}

export function formatTimeWindow(timeSlot: string): string {
  const { startTime, endTime } = getTimeWindowParts(timeSlot);
  return `${startTime} – ${endTime}`;
}

export function getScheduleStartDateTime(scheduledDate: string, timeSlot: string): Date {
  const { startTime } = getTimeWindowParts(timeSlot);
  return new Date(`${scheduledDate}T${startTime}:00`);
}

export function isScheduleRisk(appointment: Pick<
  InspectorAppointment,
  'flowType' | 'keyRequired' | 'tenantConfirmation'
>): boolean {
  if (appointment.flowType !== ServiceTypeFlowType.ROUTINE) return false;
  if (appointment.keyRequired) return false;
  return appointment.tenantConfirmation !== TenantConfirmationStatus.CONFIRMED;
}
