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

export class ReportInvalidColumnsError extends DomainError {
  constructor(invalidColumns: string[]) {
    super(
      'REPORT_INVALID_COLUMNS',
      `Unknown column(s) for this report type: ${invalidColumns.join(', ')}`,
      422,
    );
  }
}

export class ReportTenantConcurrentLimitExceededError extends TooManyRequestsError {
  constructor() {
    super('REPORT_TENANT_CONCURRENT_LIMIT_EXCEEDED', 'Tenant concurrent report limit reached');
  }
}

export class ScheduledReportNotFoundError extends NotFoundError {
  constructor() {
    super('SCHEDULED_REPORT_NOT_FOUND', 'Scheduled report not found');
  }
}

export class InvalidCronExpressionError extends DomainError {
  constructor(detail?: string) {
    super(
      'INVALID_CRON_EXPRESSION',
      detail ? `Invalid cron expression: ${detail}` : 'Invalid cron expression',
      422,
    );
  }
}

export class InvalidReportTypeError extends DomainError {
  constructor(reportType: string) {
    super('INVALID_REPORT_TYPE', `Invalid report type: ${reportType}`, 422);
  }
}

// ─── Feature 019: scheduled report errors ───────────────────────────────────

export class ScheduleForbiddenError extends ForbiddenError {
  constructor(message = 'Not permitted on this schedule') {
    super('SCHEDULE_FORBIDDEN', message);
  }
}

export class ScheduleForbiddenReassignmentError extends ForbiddenError {
  constructor() {
    super('SCHEDULE_REASSIGN_FORBIDDEN', 'Only Admin Master can reassign schedule ownership');
  }
}

export class MaxSchedulesPerUserExceededError extends DomainError {
  constructor(limit: number) {
    super(
      'MAX_SCHEDULES_PER_USER_EXCEEDED',
      `Maximum of ${limit} active schedules per user reached`,
      422,
    );
  }
}

export class InvalidRecurrenceError extends DomainError {
  constructor(detail: string) {
    super('INVALID_RECURRENCE', `Invalid recurrence: ${detail}`, 422);
  }
}

export class IncompatibleRecipientError extends DomainError {
  constructor(userId: string, reason: string) {
    super(
      'INCOMPATIBLE_RECIPIENT',
      `Recipient ${userId} is not compatible: ${reason}`,
      422,
    );
  }
}

export class IncompatibleOwnershipError extends DomainError {
  constructor(userId: string, reason: string) {
    super(
      'INCOMPATIBLE_OWNERSHIP',
      `Target owner ${userId} is not compatible: ${reason}`,
      422,
    );
  }
}

export class ScheduleRunNotFoundError extends NotFoundError {
  constructor() {
    super('SCHEDULE_RUN_NOT_FOUND', 'Scheduled report run not found');
  }
}

export class EmptyRecipientListError extends DomainError {
  constructor() {
    super(
      'EMPTY_RECIPIENT_LIST',
      'RECIPIENT_LIST delivery mode requires at least one recipient',
      422,
    );
  }
}
