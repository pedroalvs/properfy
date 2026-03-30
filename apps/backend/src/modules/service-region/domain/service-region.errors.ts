import { NotFoundError, ConflictError } from '../../../shared/domain/errors';

export class ServiceRegionNotFoundError extends NotFoundError {
  constructor() {
    super('SERVICE_REGION_NOT_FOUND', 'Service region not found');
  }
}

export class ServiceRegionNameConflictError extends ConflictError {
  constructor() {
    super(
      'SERVICE_REGION_NAME_CONFLICT',
      'A service region with this name already exists',
    );
  }
}

export class ServiceRegionAlreadyInactiveError extends ConflictError {
  constructor() {
    super(
      'SERVICE_REGION_ALREADY_INACTIVE',
      'Region is already inactive',
    );
  }
}

export class ServiceRegionStillActiveError extends ConflictError {
  constructor() {
    super(
      'SERVICE_REGION_STILL_ACTIVE',
      'Region must be deactivated before it can be deleted',
    );
  }
}
