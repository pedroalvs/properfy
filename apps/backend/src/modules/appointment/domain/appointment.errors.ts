import { NotFoundError, ForbiddenError, DomainError, ConflictError } from '../../../shared/domain/errors';

export class AppointmentNotFoundError extends NotFoundError {
  constructor() {
    super('APPOINTMENT_NOT_FOUND', 'Appointment not found');
  }
}

export class AppointmentAccessDeniedError extends ForbiddenError {
  constructor() {
    super('APPOINTMENT_ACCESS_DENIED', 'Access denied to this appointment');
  }
}

export class AppointmentInvalidTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super('APPOINTMENT_INVALID_TRANSITION', `Invalid transition from ${from} to ${to}`, 422);
  }
}

export class AppointmentTransitionNotPermittedError extends ForbiddenError {
  constructor() {
    super('APPOINTMENT_TRANSITION_NOT_PERMITTED', 'Role not permitted for this transition');
  }
}

export class AppointmentReasonRequiredError extends DomainError {
  constructor() {
    super('APPOINTMENT_REASON_REQUIRED', 'Reason is required for this transition', 422);
  }
}

export class AppointmentDoneCheckRequiredError extends DomainError {
  constructor() {
    super(
      'APPOINTMENT_DONE_CHECK_REQUIRED',
      'doneCheckedByUserId is required for DONE transition',
      422,
    );
  }
}

export class AppointmentDoneCheckerInvalidRoleError extends DomainError {
  constructor() {
    super('APPOINTMENT_DONE_CHECKER_INVALID_ROLE', 'Done checker must be AM or OP', 422);
  }
}

export class AppointmentDoneCheckerSelfCheckError extends DomainError {
  constructor() {
    super('APPOINTMENT_DONE_CHECKER_SELF_CHECK', 'Inspector cannot cross-check their own work', 422);
  }
}

export class AppointmentDoneCrossCheckSelfCheckError extends DomainError {
  constructor() {
    super('APPOINTMENT_DONE_CHECKER_SELF_CHECK', 'The actor performing the transition cannot also be the cross-checker', 422);
  }
}

export class AppointmentDoneCrossCheckNotPermittedError extends ForbiddenError {
  constructor() {
    super('APPOINTMENT_DONE_CROSS_CHECK_NOT_PERMITTED', 'Only OP or AM can cross-check DONE appointments');
  }
}

export class AppointmentDoneCrossCheckInvalidStatusError extends DomainError {
  constructor(status: string) {
    super(
      'APPOINTMENT_DONE_CROSS_CHECK_INVALID_STATUS',
      `Cross-check is only allowed for DONE appointments, current status is ${status}`,
      422,
    );
  }
}

export class AppointmentDoneCrossCheckAlreadyCompletedError extends DomainError {
  constructor() {
    super('APPOINTMENT_DONE_CROSS_CHECK_ALREADY_COMPLETED', 'Appointment was already cross-checked', 409);
  }
}

export class AppointmentDoneCrossCheckSelfApprovalError extends DomainError {
  constructor() {
    super(
      'APPOINTMENT_DONE_CROSS_CHECK_SELF_APPROVAL',
      'The same user who marked DONE cannot cross-check the appointment',
      422,
    );
  }
}

export class AppointmentDoneCrossCheckOriginNotFoundError extends DomainError {
  constructor() {
    super(
      'APPOINTMENT_DONE_CROSS_CHECK_ORIGIN_NOT_FOUND',
      'Unable to determine who marked the appointment as DONE',
      409,
    );
  }
}

export class AppointmentDoneCrossCheckEvidenceIncompleteError extends DomainError {
  constructor() {
    super(
      'APPOINTMENT_DONE_CROSS_CHECK_EVIDENCE_INCOMPLETE',
      'Appointment cannot be cross-checked before the required inspection evidence exists',
      422,
    );
  }
}

export class AppointmentInspectorRequiredError extends DomainError {
  constructor() {
    super(
      'APPOINTMENT_INSPECTOR_REQUIRED',
      'inspectorId is required for SCHEDULED transition',
      422,
    );
  }
}

export class AppointmentUpdateNotAllowedError extends DomainError {
  constructor() {
    super(
      'APPOINTMENT_UPDATE_NOT_ALLOWED',
      'Appointment can only be updated in DRAFT or AWAITING_INSPECTOR status',
      422,
    );
  }
}

export class AppointmentNoPriceRuleError extends DomainError {
  constructor() {
    super(
      'APPOINTMENT_NO_PRICE_RULE',
      'No active pricing rule found for this service type and tenant',
      422,
    );
  }
}

export class AppointmentServiceTypeNotFoundError extends NotFoundError {
  constructor() {
    super('APPOINTMENT_SERVICE_TYPE_NOT_FOUND', 'Service type not found');
  }
}

export class AppointmentServiceTypeInactiveError extends DomainError {
  constructor() {
    super('APPOINTMENT_SERVICE_TYPE_INACTIVE', 'Service type is inactive', 422);
  }
}

export class AppointmentBranchNotFoundError extends NotFoundError {
  constructor() {
    super('APPOINTMENT_BRANCH_NOT_FOUND', 'Branch not found in tenant');
  }
}

export class AppointmentBranchInactiveError extends DomainError {
  constructor() {
    super('APPOINTMENT_BRANCH_INACTIVE', 'Cannot create appointment for an inactive branch', 422);
  }
}

export class AppointmentPropertyNotFoundError extends NotFoundError {
  constructor() {
    super('APPOINTMENT_PROPERTY_NOT_FOUND', 'Property not found');
  }
}

export class AppointmentPropertyTenantMismatchError extends ForbiddenError {
  constructor() {
    super('APPOINTMENT_PROPERTY_TENANT_MISMATCH', 'Property belongs to a different tenant');
  }
}

export class AppointmentPastDateError extends DomainError {
  constructor() {
    super('APPOINTMENT_PAST_DATE', 'Scheduled date cannot be in the past', 422);
  }
}

export class AppointmentDateInPastError extends DomainError {
  constructor() {
    super('APPOINTMENT_DATE_IN_PAST', 'Scheduled date cannot be in the past', 422);
  }
}

export class AppointmentTimeInPastError extends DomainError {
  constructor() {
    super('APPOINTMENT_TIME_IN_PAST', 'Selected time slot has already passed for today — please choose a later slot', 422);
  }
}

export class AppointmentTenantConfirmationRequiredError extends DomainError {
  constructor() {
    super(
      'APPOINTMENT_TENANT_CONFIRMATION_REQUIRED',
      'Tenant confirmation is required for routine inspections before scheduling',
      422,
    );
  }
}

export class AppointmentServiceGroupRequiredError extends DomainError {
  constructor() {
    super(
      'APPOINTMENT_SERVICE_GROUP_REQUIRED',
      'Appointment must be added to a service group and published before releasing to inspectors',
      422,
    );
  }
}

export class AppointmentNotDraftError extends DomainError {
  constructor() {
    super(
      'APPOINTMENT_NOT_DRAFT',
      'Appointment can only be deleted in DRAFT status',
      422,
    );
  }
}

// `ContactNotFoundError` here was specific to /v1/appointment-contacts/:id;
// the canonical version is at `modules/contact/domain/contact.errors.ts`.

export class AppointmentImportIdempotencyPayloadMismatchError extends ConflictError {
  constructor() {
    super(
      'IDEMPOTENCY_PAYLOAD_MISMATCH',
      'Idempotency key has already been used with a different payload',
    );
  }
}

// Bulk edit errors (FR-066..FR-069)
export class AppointmentBulkFieldNotAllowedError extends DomainError {
  constructor(field: string) {
    super('APPOINTMENT_BULK_FIELD_NOT_ALLOWED', `Field '${field}' is not allowed in bulk edit`);
  }
}

export class AppointmentBulkLimitExceededError extends DomainError {
  constructor() {
    super('APPOINTMENT_BULK_LIMIT_EXCEEDED', 'Maximum 100 appointments per bulk edit request');
  }
}

export class AppointmentBulkBranchChangeNotAllowedError extends DomainError {
  constructor(appointmentId: string) {
    super('APPOINTMENT_BULK_BRANCH_CHANGE_NOT_ALLOWED', `Branch change not allowed for appointment ${appointmentId} (must be in DRAFT)`);
  }
}

export class AppointmentContactsRequiredError extends DomainError {
  constructor() {
    super('APPOINTMENT_CONTACTS_REQUIRED', 'At least one contact is required');
  }
}
