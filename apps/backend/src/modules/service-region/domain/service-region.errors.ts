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
