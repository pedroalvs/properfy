import { DomainError, NotFoundError, ForbiddenError, UnauthorizedError, ConflictError, TooManyRequestsError } from '../../../shared/domain/errors';

export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super('AUTH_INVALID_CREDENTIALS', 'Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

export class UserInactiveError extends ForbiddenError {
  constructor() {
    super('AUTH_USER_INACTIVE', 'User account is inactive');
    this.name = 'UserInactiveError';
  }
}

export class AccountLockedError extends TooManyRequestsError {
  constructor(retryAfter: string) {
    super('AUTH_ACCOUNT_LOCKED', 'Account temporarily locked', retryAfter);
    this.name = 'AccountLockedError';
  }
}

export class TotpRequiredError extends ForbiddenError {
  constructor() {
    super('AUTH_TOTP_REQUIRED', 'Two-factor authentication code required');
    this.name = 'TotpRequiredError';
  }
}

export class TotpInvalidError extends UnauthorizedError {
  constructor() {
    super('AUTH_TOTP_INVALID', 'Invalid two-factor authentication code');
    this.name = 'TotpInvalidError';
  }
}

export class TotpAlreadyEnabledError extends ConflictError {
  constructor() {
    super('AUTH_TOTP_ALREADY_ENABLED', 'Two-factor authentication is already enabled');
    this.name = 'TotpAlreadyEnabledError';
  }
}

export class TotpNotConfiguredError extends DomainError {
  constructor() {
    super('AUTH_TOTP_NOT_CONFIGURED', 'Two-factor authentication has not been set up yet', 400);
    this.name = 'TotpNotConfiguredError';
  }
}

export class TotpSetupRequiredError extends ForbiddenError {
  constructor() {
    super('AUTH_TOTP_SETUP_REQUIRED', 'Two-factor authentication setup required');
    this.name = 'TotpSetupRequiredError';
  }
}

export class InvalidRefreshTokenError extends UnauthorizedError {
  constructor() {
    super('AUTH_INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
    this.name = 'InvalidRefreshTokenError';
  }
}

export class SessionInvalidError extends ForbiddenError {
  constructor() {
    super('AUTH_SESSION_INVALID', "Session is no longer valid");
    this.name = 'SessionInvalidError';
  }
}

export class SessionNotFoundError extends NotFoundError {
  constructor() {
    super('SESSION_NOT_FOUND', 'Session not found');
    this.name = 'SessionNotFoundError';
  }
}

export class InvalidCurrentPasswordError extends DomainError {
  constructor() {
    super('AUTH_INVALID_CURRENT_PASSWORD', 'Current password is incorrect', 400);
    this.name = 'InvalidCurrentPasswordError';
  }
}

export class PasswordTooCommonError extends DomainError {
  constructor() {
    super('AUTH_PASSWORD_TOO_COMMON', 'Password is too common', 400);
    this.name = 'PasswordTooCommonError';
  }
}

export class PasswordSameAsCurrentError extends DomainError {
  constructor() {
    super('AUTH_PASSWORD_SAME_AS_CURRENT', 'New password must differ from current', 400);
    this.name = 'PasswordSameAsCurrentError';
  }
}

export class PasswordTooWeakError extends DomainError {
  constructor(violations: string[]) {
    super('AUTH_PASSWORD_TOO_WEAK', 'Password does not meet strength requirements', 400, violations);
    this.name = 'PasswordTooWeakError';
  }
}
