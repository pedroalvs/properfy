import { NotFoundError, DomainError, ConflictError } from '../../../shared/domain/errors';

export class ServiceGroupNotFoundError extends NotFoundError {
  constructor() {
    super('SERVICE_GROUP_NOT_FOUND', 'Service group not found');
  }
}

export class ServiceGroupInvalidStatusError extends DomainError {
  constructor(expected: string, actual: string) {
    super('SERVICE_GROUP_INVALID_STATUS', `Expected status ${expected}, got ${actual}`, 422);
  }
}

export class GroupSizeTooSmallError extends DomainError {
  constructor(size: number) {
    super('GROUP_SIZE_TOO_SMALL', `Group must have at least 5 appointments, got ${size}`, 422);
  }
}

export class GroupSizeTooLargeError extends DomainError {
  constructor(size: number) {
    super('GROUP_SIZE_TOO_LARGE', `Group must have at most 25 appointments, got ${size}`, 422);
  }
}

export class AppointmentInvalidStatusError extends DomainError {
  constructor(appointmentId: string) {
    super(
      'APPOINTMENT_INVALID_STATUS',
      `Appointment ${appointmentId} is not in AWAITING_INSPECTOR status`,
      422,
    );
  }
}

export class AppointmentAlreadyInGroupError extends DomainError {
  constructor(appointmentId: string) {
    super(
      'APPOINTMENT_ALREADY_IN_GROUP',
      `Appointment ${appointmentId} already belongs to a service group`,
      422,
    );
  }
}

export class ServiceTypeMismatchError extends DomainError {
  constructor() {
    super('SERVICE_TYPE_MISMATCH', 'All appointments must have the same service type', 422);
  }
}

export class InspectorIneligibleError extends DomainError {
  constructor() {
    super('INSPECTOR_INELIGIBLE', 'Inspector does not meet eligibility criteria', 422);
  }
}

export class InspectorServiceTypeIneligibleError extends DomainError {
  constructor() {
    super(
      'INSPECTOR_SERVICE_TYPE_INELIGIBLE',
      'Inspector is not eligible for this service type',
      422,
    );
  }
}

export class InspectorInactiveError extends DomainError {
  constructor() {
    super('INSPECTOR_INACTIVE', 'Inspector is not active', 422);
  }
}

export class GroupAlreadyAcceptedError extends ConflictError {
  constructor() {
    super('GROUP_ALREADY_ACCEPTED', 'Service group has already been accepted by another inspector');
  }
}

export class PriorityDateTooCloseError extends DomainError {
  constructor() {
    super(
      'PRIORITY_DATE_TOO_CLOSE',
      'PRIORITY_24H requires scheduled date at least 24h from now',
      422,
    );
  }
}

export class PriorityExpiredError extends DomainError {
  constructor() {
    super('PRIORITY_EXPIRED', 'PRIORITY_24H window has expired', 422);
  }
}

export class InvalidTimeWindowFormatError extends DomainError {
  constructor() {
    super('INVALID_TIME_WINDOW_FORMAT', 'Time window must match format HH:mm-HH:mm', 422);
  }
}
