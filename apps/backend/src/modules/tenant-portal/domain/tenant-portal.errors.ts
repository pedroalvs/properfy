import { NotFoundError, ForbiddenError, ConflictError, DomainError } from '../../../shared/domain/errors';

export class PortalTokenInvalidError extends NotFoundError {
  constructor() {
    super('PORTAL_TOKEN_INVALID', 'Portal token not found or invalid');
  }
}

export class PortalTokenRevokedError extends DomainError {
  constructor() {
    super('PORTAL_TOKEN_REVOKED', 'Portal token has been revoked', 410);
    this.name = 'PortalTokenRevokedError';
  }
}

export class PortalActionBlockedError extends ForbiddenError {
  constructor() {
    super('PORTAL_ACTION_BLOCKED', 'Action not allowed past the cutoff time');
  }
}

export class PortalAppointmentInactiveError extends ConflictError {
  constructor() {
    super('PORTAL_APPOINTMENT_INACTIVE', 'Appointment is no longer active');
  }
}

export class PortalRescheduleNotAllowedError extends ForbiddenError {
  constructor() {
    super('PORTAL_RESCHEDULE_NOT_ALLOWED', 'Reschedule not allowed for this service type');
  }
}

export class PortalRescheduleWindowExceededError extends DomainError {
  constructor() {
    super('PORTAL_RESCHEDULE_WINDOW_EXCEEDED', 'New date exceeds the 30-day reschedule window', 422);
    this.name = 'PortalRescheduleWindowExceededError';
  }
}

export class PortalDateInPastError extends DomainError {
  constructor() {
    super('PORTAL_DATE_IN_PAST', 'New date cannot be in the past', 422);
    this.name = 'PortalDateInPastError';
  }
}

export class PortalNoContactFieldsError extends DomainError {
  constructor() {
    super('PORTAL_NO_CONTACT_FIELDS', 'At least one contact field must be provided', 422);
    this.name = 'PortalNoContactFieldsError';
  }
}

export class PortalInspectionInProgressError extends ConflictError {
  constructor() {
    super('PORTAL_INSPECTION_IN_PROGRESS', 'Reschedule is not allowed while the inspection is in progress');
  }
}

export class PortalInspectionAlreadyStartedError extends ConflictError {
  constructor() {
    super('PORTAL_INSPECTION_ALREADY_STARTED', 'Portal changes are not allowed after the inspection has started');
  }
}

export class PortalTokenAlreadyUsedError extends ConflictError {
  constructor() {
    super('PORTAL_TOKEN_ALREADY_USED', 'This portal token has already been used for a mutation');
  }
}

export class PortalGroupNotFoundError extends NotFoundError {
  constructor() {
    super('PORTAL_GROUP_NOT_FOUND', 'Service group not found or no longer eligible');
  }
}

export class PortalGroupFullError extends ConflictError {
  constructor() {
    super('PORTAL_GROUP_FULL', 'Service group has reached maximum confirmed capacity');
  }
}

export class PortalGroupUnavailableError extends ConflictError {
  constructor() {
    super('PORTAL_GROUP_UNAVAILABLE', 'Service group is no longer available for joining');
  }
}

export class PortalTokenSupersededError extends DomainError {
  constructor() {
    super('PORTAL_TOKEN_SUPERSEDED', 'This portal token has been superseded by a new confirmation cycle', 410);
    this.name = 'PortalTokenSupersededError';
  }
}
