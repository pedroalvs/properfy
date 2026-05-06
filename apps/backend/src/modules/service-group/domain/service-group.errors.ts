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
    super('GROUP_SIZE_TOO_LARGE', `Group must have at most 30 appointments, got ${size}`, 422);
  }
}

export class AppointmentInvalidStatusError extends DomainError {
  constructor(appointmentNumber: number) {
    super(
      'APPOINTMENT_INVALID_STATUS',
      `Appointment #${appointmentNumber} is not in AWAITING_INSPECTOR or DRAFT status`,
      422,
    );
  }
}

export class AppointmentAlreadyInGroupError extends DomainError {
  constructor(appointmentNumber: number) {
    super(
      'APPOINTMENT_ALREADY_IN_GROUP',
      `Appointment #${appointmentNumber} already belongs to a service group`,
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

export class AssignedInspectorConflictError extends ConflictError {
  constructor(_currentInspectorId: string) {
    super(
      'ASSIGNED_INSPECTOR_CONFLICT',
      'Service group is already assigned to a different inspector',
    );
  }
}

export class AppointmentsNotAwaitingInspectorError extends DomainError {
  constructor(invalidAppointments: Array<{ appointmentNumber: number; status: string }>) {
    const details = invalidAppointments
      .map((a) => `#${a.appointmentNumber} (${a.status})`)
      .join(', ');
    super(
      'APPOINTMENTS_NOT_AWAITING_INSPECTOR',
      `Cannot accept: appointments no longer in AWAITING_INSPECTOR status: ${details}`,
      422,
    );
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

export class ServiceRegionRequiredError extends DomainError {
  constructor() {
    super('SERVICE_REGION_REQUIRED', 'A service region must be assigned before publishing', 422);
  }
}

export class ServiceRegionInactiveError extends DomainError {
  constructor() {
    super('SERVICE_REGION_INACTIVE', 'The assigned service region is no longer active', 422);
  }
}

export class ServiceGroupNotDraftError extends DomainError {
  constructor() {
    super(
      'SERVICE_GROUP_NOT_DRAFT',
      'Draft-only fields (scheduledDate, timeWindow, priorityMode, exceptionType, exceptionReason) can only be updated when the service group is in DRAFT status',
      422,
    );
  }
}
