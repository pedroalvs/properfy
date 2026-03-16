import type { AppointmentStatus } from '../enums/appointment';

export const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  DRAFT: ['AWAITING_INSPECTOR', 'REJECTED', 'CANCELLED'],
  AWAITING_INSPECTOR: ['SCHEDULED', 'CANCELLED', 'REJECTED'],
  SCHEDULED: ['DONE', 'CANCELLED', 'REJECTED'],
  DONE: ['DRAFT'],
  CANCELLED: ['DRAFT'],
  REJECTED: ['DRAFT'],
};
