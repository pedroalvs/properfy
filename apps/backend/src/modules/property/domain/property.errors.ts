import { NotFoundError, ConflictError } from '../../../shared/domain/errors';

export class PropertyNotFoundError extends NotFoundError {
  constructor() {
    super('PROPERTY_NOT_FOUND', 'Property not found');
  }
}

export class PropertyCodeConflictError extends ConflictError {
  constructor() {
    super(
      'PROPERTY_CODE_CONFLICT',
      'A property with this code already exists in this tenant',
    );
  }
}

export class PropertyHasActiveAppointmentsError extends ConflictError {
  constructor() {
    super(
      'PROPERTY_HAS_ACTIVE_APPOINTMENTS',
      'Cannot delete property with active appointments',
    );
  }
}

export class PropertyAlreadyDeletedError extends ConflictError {
  constructor() {
    super('PROPERTY_ALREADY_DELETED', 'Property is already deleted');
  }
}
