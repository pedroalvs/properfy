import { NotFoundError, ConflictError } from '../../../shared/domain/errors';

export class InspectorNotFoundError extends NotFoundError {
  constructor() {
    super('INSPECTOR_NOT_FOUND', 'Inspector not found');
  }
}

export class InspectorEmailConflictError extends ConflictError {
  constructor() {
    super('INSPECTOR_EMAIL_CONFLICT', 'An inspector with this email already exists');
  }
}

export class InspectorAlreadyInactiveError extends ConflictError {
  constructor() {
    super('INSPECTOR_ALREADY_INACTIVE', 'Inspector is already inactive');
  }
}

export class AvailabilitySlotNotFoundError extends NotFoundError {
  constructor() {
    super('AVAILABILITY_SLOT_NOT_FOUND', 'Availability slot not found');
  }
}

export class AvailabilitySlotOverlapError extends ConflictError {
  constructor() {
    super('AVAILABILITY_SLOT_OVERLAP', 'This slot overlaps with an existing availability slot');
  }
}
