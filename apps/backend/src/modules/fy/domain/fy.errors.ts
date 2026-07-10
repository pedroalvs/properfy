import { ConflictError, NotFoundError } from '../../../shared/domain/errors';

export class NoActiveAppointmentsError extends NotFoundError {
  constructor() {
    super('NO_ACTIVE_APPOINTMENTS', 'No active appointments found for this phone number');
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
