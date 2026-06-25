import { NotFoundError, ConflictError } from '../../../shared/domain/errors';

export class ServiceTypeNotFoundError extends NotFoundError {
  constructor() {
    super('SERVICE_TYPE_NOT_FOUND', 'Service type not found');
  }
}

export class ServiceTypeCodeConflictError extends ConflictError {
  constructor() {
    super(
      'SERVICE_TYPE_CODE_CONFLICT',
      'A service type with this code already exists',
    );
  }
}

export class ServiceTypeNameConflictError extends ConflictError {
  constructor() {
    super(
      'SERVICE_TYPE_NAME_CONFLICT',
      'A service type with this name already exists',
    );
  }
}
