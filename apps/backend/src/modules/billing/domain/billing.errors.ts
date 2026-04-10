import { NotFoundError, ConflictError, DomainError, ValidationError } from '../../../shared/domain/errors';

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

export class RefundExceedsOriginalAmountError extends DomainError {
  constructor(requested: number, remaining: number) {
    super(
      'REFUND_EXCEEDS_ORIGINAL_AMOUNT',
      `Refund amount ${requested} exceeds remaining refundable amount ${remaining}`,
      422,
    );
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

export class InvoiceNotClosedError extends ConflictError {
  constructor() {
    super('INVOICE_NOT_CLOSED', 'Invoice is not in CLOSED status');
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

export class FinancialEntryDoneCheckRequiredError extends DomainError {
  constructor() {
    super('DONE_CHECK_REQUIRED', 'Appointment must have doneCheckedByUserId set before financial entries can be created', 422);
  }
}

export class InvalidEntryStatusTransitionError extends ConflictError {
  constructor(fromStatus: string, toStatus: string) {
    super('INVALID_ENTRY_STATUS_TRANSITION', `Cannot transition financial entry from ${fromStatus} to ${toStatus}`);
  }
}

export class EntryNotApprovedError extends ConflictError {
  constructor() {
    super('ENTRY_NOT_APPROVED', 'Financial entry is not in APPROVED status');
  }
}

export class TenantInvoiceNotFoundError extends NotFoundError {
  constructor() {
    super('TENANT_INVOICE_NOT_FOUND', 'Tenant invoice not found');
  }
}

export class TenantInvoicePeriodOverlapError extends ConflictError {
  constructor() {
    super('TENANT_INVOICE_PERIOD_OVERLAP', 'An overlapping tenant invoice already exists for this tenant');
  }
}

export class TenantInvoiceNotRegenerableError extends ConflictError {
  constructor() {
    super('TENANT_INVOICE_NOT_REGENERABLE', 'Tenant invoice must be CLOSED or PAID to regenerate');
  }
}

export class InvoiceNotRegenerableError extends ConflictError {
  constructor() {
    super('INVOICE_NOT_REGENERABLE', 'Invoice must be CLOSED or PAID to regenerate');
  }
}

// ─── Payment reconciliation (feature 017) ────────────────────────────────

export class InvoiceAlreadyPaidError extends ConflictError {
  constructor() {
    super('INVOICE_ALREADY_PAID', 'Invoice is already marked as paid');
  }
}

export class InvoiceNotPaidError extends ConflictError {
  constructor() {
    super('INVOICE_NOT_PAID', 'Invoice is not in PAID status');
  }
}

export class InvoicePaymentDateInvalidError extends ValidationError {
  constructor(public readonly kind: 'future' | 'before_generated_at') {
    super(
      kind === 'future'
        ? 'paidAt cannot be in the future (server UTC + 1h grace window exceeded)'
        : 'paidAt cannot be before the invoice generatedAt timestamp',
      { kind },
    );
  }
}

export class MultiCurrencyScopeError extends DomainError {
  constructor(public readonly currencies: string[]) {
    super(
      'MULTI_CURRENCY_SCOPE',
      `Reconciliation scope contains invoices in multiple currencies: ${currencies.join(', ')}. Narrow filters to obtain a coherent summary.`,
      400,
      { currencies },
    );
  }
}
