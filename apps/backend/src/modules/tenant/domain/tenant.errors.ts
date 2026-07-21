import { NotFoundError, ConflictError, ValidationError } from '../../../shared/domain/errors';

export class TenantNotFoundError extends NotFoundError {
  constructor() {
    super('TENANT_NOT_FOUND', 'Tenant not found');
  }
}

export class TenantLegalNameConflictError extends ConflictError {
  constructor() {
    super(
      'TENANT_LEGAL_NAME_CONFLICT',
      'A tenant with this legal name already exists',
    );
  }
}

export class TenantAppointmentCodePrefixConflictError extends ConflictError {
  constructor() {
    super(
      'TENANT_PREFIX_CONFLICT',
      'This appointment code prefix is already in use by another agency',
    );
  }
}

export class TenantAlreadyInactiveError extends ConflictError {
  constructor() {
    super('TENANT_ALREADY_INACTIVE', 'Tenant is already inactive');
  }
}

export class TenantAlreadyActiveError extends ConflictError {
  constructor() {
    super('TENANT_ALREADY_ACTIVE', 'Tenant is already active');
  }
}

export class TenantHasOpenAppointmentsError extends ConflictError {
  constructor() {
    super(
      'TENANT_HAS_OPEN_APPOINTMENTS',
      'Cannot deactivate tenant with open appointments',
    );
  }
}

export class TenantInactiveError extends ConflictError {
  constructor() {
    super('TENANT_INACTIVE', 'Tenant is not active');
  }
}

export class BranchNotFoundError extends NotFoundError {
  constructor() {
    super('BRANCH_NOT_FOUND', 'Branch not found');
  }
}

export class BranchNameConflictError extends ConflictError {
  constructor() {
    super(
      'BRANCH_NAME_CONFLICT',
      'A branch with this name already exists in this tenant',
    );
  }
}

export class BranchAlreadyInactiveError extends ConflictError {
  constructor() {
    super('BRANCH_ALREADY_INACTIVE', 'Branch is already inactive');
  }
}

export class BranchHasOpenAppointmentsError extends ConflictError {
  constructor() {
    super(
      'BRANCH_HAS_OPEN_APPOINTMENTS',
      'Cannot deactivate branch with open appointments',
    );
  }
}

export class BranchAlreadyActiveError extends ConflictError {
  constructor() {
    super('BRANCH_ALREADY_ACTIVE', 'Branch is already active');
  }
}

export class LogoStorageKeyInvalidError extends ValidationError {
  constructor() {
    super('Invalid logo storage key format', undefined, 'LOGO_STORAGE_KEY_INVALID');
  }
}

export class LogoUploadObjectNotFoundError extends ValidationError {
  constructor() {
    super(
      'Logo object not found in storage — upload may have failed or key is incorrect',
      undefined,
      'LOGO_UPLOAD_OBJECT_NOT_FOUND',
    );
  }
}
