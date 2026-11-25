import { ADDRESS_NOT_VERIFIED_CODE, type AddressNotVerifiedReason } from '@properfy/shared';
import { NotFoundError, ConflictError, DomainError } from '../../../shared/domain/errors';

/**
 * 422 raised on save when a property address cannot be verified against the
 * permanent geocoder (rule A). Nothing is written. `details[0].reason` carries
 * the machine reason (`NOT_FOUND` / `COARSE_RESULT` / `LOW_RELEVANCE`) so the
 * client renders the matching `ADDRESS_NOT_VERIFIED_MESSAGES` copy and marks the
 * address fields. The rural escape (a manual coordinate pair) bypasses this.
 */
export class PropertyAddressNotVerifiedError extends DomainError {
  constructor(reason: AddressNotVerifiedReason) {
    super(ADDRESS_NOT_VERIFIED_CODE, 'The address could not be verified.', 422, [
      { field: 'address', reason },
    ]);
  }
}

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

export class PropertyAddressConflictError extends ConflictError {
  constructor() {
    super(
      'PROPERTY_ADDRESS_CONFLICT',
      'An active property with this exact address already exists in this tenant',
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

export class IdempotencyPayloadMismatchError extends ConflictError {
  constructor() {
    super(
      'IDEMPOTENCY_PAYLOAD_MISMATCH',
      'Idempotency key has already been used with a different payload',
    );
  }
}
