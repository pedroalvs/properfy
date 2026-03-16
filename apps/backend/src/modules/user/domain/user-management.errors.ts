import { NotFoundError, ConflictError } from '../../../shared/domain/errors';

export class UserNotFoundError extends NotFoundError {
  constructor() {
    super('USER_NOT_FOUND', 'User not found');
  }
}

export class UserEmailConflictError extends ConflictError {
  constructor() {
    super('USER_EMAIL_CONFLICT', 'A user with this email already exists');
  }
}

export class UserAlreadyInactiveError extends ConflictError {
  constructor() {
    super('USER_ALREADY_INACTIVE', 'User is already inactive');
  }
}
