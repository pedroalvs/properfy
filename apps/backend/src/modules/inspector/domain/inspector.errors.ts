import { NotFoundError, ConflictError, DomainError, ValidationError } from '../../../shared/domain/errors';

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

export class InspectorHasOpenAppointmentsError extends ConflictError {
  constructor(total: number, breakdown: Record<string, number>) {
    const parts = Object.entries(breakdown)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => `${count} ${status}`);
    const detail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
    super(
      'INSPECTOR_HAS_OPEN_APPOINTMENTS',
      `Cannot deactivate inspector with ${total} open appointment${total !== 1 ? 's' : ''}${detail}`,
    );
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

export class AvailabilitySlotCapacityExhaustedError extends ConflictError {
  constructor() {
    super('AVAILABILITY_SLOT_CAPACITY_EXHAUSTED', 'Inspector has no remaining capacity in the matching availability slot');
  }
}

export class AvailabilitySlotNotMatchedError extends DomainError {
  constructor() {
    super('AVAILABILITY_SLOT_NOT_MATCHED', 'No matching availability slot found for the inspector on the scheduled date and time', 422);
  }
}

export class InspectorPhotoInvalidKeyError extends ValidationError {
  constructor() {
    super('Invalid inspector photo storage key format', undefined, 'INSPECTOR_PHOTO_KEY_INVALID');
  }
}

export class InspectorPhotoObjectNotFoundError extends ValidationError {
  constructor() {
    super(
      'Inspector photo object not found in storage — upload may have failed or key is incorrect',
      undefined,
      'INSPECTOR_PHOTO_OBJECT_NOT_FOUND',
    );
  }
}

export class InspectorDocumentInvalidKeyError extends ValidationError {
  constructor() {
    super(
      'Invalid inspector document storage key format',
      undefined,
      'INSPECTOR_DOCUMENT_KEY_INVALID',
    );
  }
}

export class InspectorDocumentObjectNotFoundError extends ValidationError {
  constructor() {
    super(
      'Inspector document object not found in storage — upload may have failed or key is incorrect',
      undefined,
      'INSPECTOR_DOCUMENT_OBJECT_NOT_FOUND',
    );
  }
}
