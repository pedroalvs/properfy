import {
  DomainError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../shared/domain/errors';

/**
 * Feature 020: audit-retention and erasure domain errors.
 *
 * These live in the audit module's domain layer and are raised exclusively by
 * the Feature 020 use cases (retention category upsert, preservation rules,
 * legal holds, erasure workflow, PII registry mutations).
 */

export class RetentionCategoryNotFoundError extends NotFoundError {
  constructor(name: string) {
    super('RETENTION_CATEGORY_NOT_FOUND', `Retention category ${name} not found`);
  }
}

export class RetentionPeriodTooShortError extends ValidationError {
  constructor(categoryName: string, minimumYears: number) {
    super(
      `Retention period for ${categoryName} cannot be shorter than ${minimumYears} years`,
      { categoryName, minimumYears, code: 'RETENTION_PERIOD_TOO_SHORT' },
    );
  }
}

export class PreservationRuleConflictError extends DomainError {
  constructor(detail: string) {
    super('PRESERVATION_RULE_CONFLICT', detail, 409);
  }
}

export class LegalHoldAlreadyReleasedError extends DomainError {
  constructor() {
    super('LEGAL_HOLD_ALREADY_RELEASED', 'Legal hold has already been released', 409);
  }
}

export class ErasureRequestNotFoundError extends NotFoundError {
  constructor() {
    super('ERASURE_REQUEST_NOT_FOUND', 'Data subject erasure request not found');
  }
}

export class ErasureRequestInvalidStateError extends DomainError {
  constructor(currentStatus: string, attemptedAction: string) {
    super(
      'ERASURE_REQUEST_INVALID_STATE',
      `Cannot ${attemptedAction} an erasure request in status ${currentStatus}`,
      409,
    );
  }
}

export class ErasureForbiddenError extends ForbiddenError {
  constructor() {
    super('ERASURE_FORBIDDEN', 'Only Admin Master can initiate or confirm data subject erasure requests');
  }
}

export class RetentionPolicyForbiddenError extends ForbiddenError {
  constructor() {
    super(
      'RETENTION_POLICY_FORBIDDEN',
      'Only Admin Master can modify retention categories, preservation rules, legal holds, or PII field mappings',
    );
  }
}

export class PiiMappingNotFoundError extends NotFoundError {
  constructor() {
    super('PII_MAPPING_NOT_FOUND', 'PII field mapping not found');
  }
}

export class IncludeArchivedForbiddenError extends ForbiddenError {
  constructor() {
    super(
      'INCLUDE_ARCHIVED_FORBIDDEN',
      'CL_ADMIN cannot include archived audit entries in queries (cold storage is AM/OP-only)',
    );
  }
}
