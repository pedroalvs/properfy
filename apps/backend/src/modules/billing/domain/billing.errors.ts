import { NotFoundError, ConflictError, DomainError } from '../../../shared/domain/errors';

export class EntryNotFoundError extends NotFoundError {
  constructor() {
    super('ENTRY_NOT_FOUND', 'Financial entry not found');
  }
}

export class EntryNotPendingError extends ConflictError {
  constructor() {
    super('ENTRY_NOT_PENDING', 'Financial entry is not in PENDING status');
  }
}

export class EntrySelfApprovalNotAllowedError extends DomainError {
  constructor() {
    super('ENTRY_SELF_APPROVAL_NOT_ALLOWED', 'Approver cannot be the same as initiator', 422);
  }
}

export class EntryNotRefundableError extends DomainError {
  constructor() {
    super('ENTRY_NOT_REFUNDABLE', 'Entry is not an approved tenant debit', 422);
  }
}

export class RefundAlreadyExistsError extends ConflictError {
  constructor() {
    super('REFUND_ALREADY_EXISTS', 'A refund already exists for this entry');
  }
}

export class InvoiceNotFoundError extends NotFoundError {
  constructor() {
    super('INVOICE_NOT_FOUND', 'Invoice not found');
  }
}

export class InvoicePeriodOverlapError extends ConflictError {
  constructor() {
    super('INVOICE_PERIOD_OVERLAP', 'An overlapping invoice already exists for this inspector');
  }
}

export class InvoiceNotReadyError extends ConflictError {
  constructor() {
    super('INVOICE_NOT_READY', 'Invoice is not in CLOSED or PAID status');
  }
}

export class InvoiceFileNotGeneratedError extends ConflictError {
  constructor() {
    super('INVOICE_FILE_NOT_GENERATED', 'Invoice file has not been generated yet');
  }
}

export class InspectorNotFoundError extends NotFoundError {
  constructor() {
    super('INSPECTOR_NOT_FOUND', 'Inspector not found');
  }
}
