import { NotFoundError, ValidationError } from '../../../shared/domain/errors';

export class AppCredentialNotFoundError extends NotFoundError {
  constructor() {
    super('APP_CREDENTIAL_NOT_FOUND', 'App credential not found');
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

/** Thrown when the target tenant does not exist or is not active. */
export class AppCredentialTenantInvalidError extends ValidationError {
  constructor() {
    super(
      'Tenant not found or not active',
      [{ field: 'tenantId', message: 'Tenant not found or not active' }],
      'APP_CREDENTIAL_TENANT_INVALID',
    );
  }
}
