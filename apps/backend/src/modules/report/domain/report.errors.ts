import { NotFoundError, ForbiddenError, ConflictError, DomainError, TooManyRequestsError } from '../../../shared/domain/errors';

export class ReportNotFoundError extends NotFoundError {
  constructor() {
    super('REPORT_NOT_FOUND', 'Report not found');
  }
}

export class ReportNotReadyError extends ConflictError {
  constructor() {
    super('REPORT_NOT_READY', 'Report is not ready for download');
  }
}

export class ReportExpiredError extends DomainError {
  constructor() {
    super('REPORT_EXPIRED', 'Report file has expired', 410);
  }
}

export class ReportTenantScopeViolationError extends ForbiddenError {
  constructor() {
    super('REPORT_TENANT_SCOPE_VIOLATION', 'Cannot access reports from another tenant');
  }
}

export class ReportDateRangeExceededError extends DomainError {
  constructor(maxMonths: number) {
    super('REPORT_DATE_RANGE_EXCEEDED', `Date range exceeds maximum of ${maxMonths} months`, 422);
  }
}

export class ReportConcurrentLimitExceededError extends TooManyRequestsError {
  constructor() {
    super('REPORT_CONCURRENT_LIMIT_EXCEEDED', 'Maximum concurrent report limit reached');
  }
}

export class ReportTypeForbiddenError extends ForbiddenError {
  constructor() {
    super('FORBIDDEN', 'Role not permitted for this report type');
  }
}
