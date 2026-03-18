import { NotFoundError, ConflictError, DomainError } from '../../../shared/domain/errors';

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

export class TenantInactiveError extends DomainError {
  constructor() {
    super('TENANT_INACTIVE', 'Cannot create property for an inactive tenant', 422);
  }
}

export class BranchInactiveError extends DomainError {
  constructor() {
    super('BRANCH_INACTIVE', 'Cannot create property for an inactive branch', 422);
  }
}

export class PropertyGeocodingManualOverrideError extends DomainError {
  constructor() {
    super(
      'PROPERTY_GEOCODING_MANUAL_OVERRIDE',
      'Property has manually set coordinates and cannot be re-geocoded',
      422,
    );
  }
}
