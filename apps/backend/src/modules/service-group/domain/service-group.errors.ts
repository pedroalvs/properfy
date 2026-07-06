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

export class ServiceGroupDateInPastError extends DomainError {
  constructor() {
    super('SERVICE_GROUP_DATE_IN_PAST', 'Service group scheduled date cannot be in the past', 422);
  }
}

export class ServiceGroupTimeInPastError extends DomainError {
  constructor() {
    super('SERVICE_GROUP_TIME_IN_PAST', 'Selected time window has already passed for today — please choose a later window', 422);
  }
}

export class ServiceGroupNotDraftError extends DomainError {
  constructor() {
    super(
      'SERVICE_GROUP_NOT_DRAFT',
      'Draft-only fields (scheduledDate and timeWindow) can only be updated when the service group is in DRAFT status',
      422,
    );
  }
}
