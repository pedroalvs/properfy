import { NotFoundError, ValidationError } from '../../../shared/domain/errors';

export class AppCredentialNotFoundError extends NotFoundError {
  constructor() {
    super('APP_CREDENTIAL_NOT_FOUND', 'App credential not found');
  }
}

/** Thrown when needsAuthCode is true but no authCode is present (merged state). */
export class AppCredentialAuthCodeRequiredError extends ValidationError {
  constructor() {
    super(
      'authCode is required when needsAuthCode is true',
      [{ field: 'authCode', message: 'authCode is required when needsAuthCode is true' }],
      'APP_CREDENTIAL_AUTH_CODE_REQUIRED',
    );
  }
}

/** Thrown when the given branch does not exist within the credential's tenant. */
export class AppCredentialBranchInvalidError extends ValidationError {
  constructor() {
    super(
      'Branch not found in the credential tenant',
      [{ field: 'branchId', message: 'Branch not found in the credential tenant' }],
      'APP_CREDENTIAL_BRANCH_INVALID',
    );
  }
}
