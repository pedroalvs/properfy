import { ConflictError, NotFoundError } from '../../../shared/domain/errors';
import type { FyPhoneMatchDiagnostics } from './fy.repository';

/**
 * The base message stays stable for existing consumers; the suffix and the
 * `details` payload tell the bot WHY nothing is visible (unknown phone vs
 * appointments hidden in non-active statuses) so a miss is actionable
 * instead of a support ticket.
 */
function noActiveAppointmentsMessage(diagnostics?: FyPhoneMatchDiagnostics): string {
  const base = 'No active appointments found for this phone number';
  if (!diagnostics) return base;
  if (!diagnostics.phoneKnown) return `${base} — the phone does not match any contact`;
  if (diagnostics.otherAppointments.length === 0) {
    return `${base} — the contact exists but has no appointments`;
  }
  const breakdown = diagnostics.otherAppointments
    .map((s) => `${s.status}: ${s.count}`)
    .join(', ');
  return `${base} — appointment(s) exist in other statuses (${breakdown}); query with statusIn to retrieve them`;
}

export class NoActiveAppointmentsError extends NotFoundError {
  constructor(diagnostics?: FyPhoneMatchDiagnostics) {
    super('NO_ACTIVE_APPOINTMENTS', noActiveAppointmentsMessage(diagnostics), diagnostics);
    this.name = 'NoActiveAppointmentsError';
  }
}

export class AgencyNotFoundError extends NotFoundError {
  constructor() {
    super('AGENCY_NOT_FOUND', 'Agency not found');
    this.name = 'AgencyNotFoundError';
  }
}

/** Residential Tenancies Act 2010 — minimum 7-day notice for new dates. */
export class NoticePeriodViolationError extends ConflictError {
  constructor() {
    super(
      'VIOLATES_NOTICE_PERIOD',
      'All candidate dates violate the minimum 7-day notice period',
    );
    this.name = 'NoticePeriodViolationError';
  }
}
