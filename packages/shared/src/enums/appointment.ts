export const AppointmentStatus = {
  DRAFT: 'DRAFT',
  AWAITING_INSPECTOR: 'AWAITING_INSPECTOR',
  SCHEDULED: 'SCHEDULED',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

/**
 * Human-readable labels for AppointmentStatus — single source for the web and
 * PWA status chips AND for API error messages. Rejection messages are read by
 * operators, so they must say "Scheduled", never the raw `SCHEDULED` enum.
 */
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  DRAFT: 'Draft',
  AWAITING_INSPECTOR: 'Awaiting Inspector',
  SCHEDULED: 'Scheduled',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
};

/**
 * Appointments settled **for group-cascade purposes**: editing a service
 * group's date or time window must leave them where they are.
 *
 * Do NOT read this as "these can never be edited". `isScheduleEditable()`
 * deliberately still permits a schedule edit on REJECTED, because REJECTED is
 * internal triage the rental tenant is never notified about and the row is
 * revivable — an operator fixing the date before reviving it is a supported
 * one-step flow. Only CANCELLED and DONE are closed to the tenant, and only
 * those are blocked there.
 *
 * NOT usable as a group-join filter. `CreateServiceGroupUseCase` and
 * `AddAppointmentsToGroupUseCase` deliberately sync an appointment's schedule
 * while it is still REJECTED, immediately before transitioning it to
 * AWAITING_INSPECTOR — filtering on this set there would skip exactly the
 * appointments being revived into a group.
 */
export const TERMINAL_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  AppointmentStatus.DONE,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.REJECTED,
];

/** True when the appointment's schedule is settled — see `TERMINAL_APPOINTMENT_STATUSES`. */
export const isTerminalAppointmentStatus = (status: string): boolean =>
  (TERMINAL_APPOINTMENT_STATUSES as readonly string[]).includes(status);

export const RentalTenantConfirmationStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  UNAVAILABLE: 'UNAVAILABLE',
  NO_RESPONSE: 'NO_RESPONSE',
} as const;
export type RentalTenantConfirmationStatus = (typeof RentalTenantConfirmationStatus)[keyof typeof RentalTenantConfirmationStatus];

export const RestrictionSource = {
  RENTAL_TENANT_PORTAL: 'RENTAL_TENANT_PORTAL',
  OPERATOR: 'OPERATOR',
  IMPORT: 'IMPORT',
} as const;
export type RestrictionSource = (typeof RestrictionSource)[keyof typeof RestrictionSource];
