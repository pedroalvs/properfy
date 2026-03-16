import { NotFoundError, ForbiddenError, ConflictError, DomainError } from '../../../shared/domain/errors';

export class ExecutionAppointmentNotFoundError extends NotFoundError {
  constructor() {
    super('APPOINTMENT_NOT_FOUND', 'Appointment not found or not assigned to this inspector');
  }
}

export class ExecutionT1BlockedError extends ForbiddenError {
  constructor() {
    super('EXECUTION_T1_BLOCKED', 'Appointment not visible at T-1: tenant not confirmed');
  }
}

export class ExecutionAlreadyFinishedError extends ConflictError {
  constructor() {
    super('EXECUTION_ALREADY_FINISHED', 'Inspection execution already completed');
  }
}

export class ExecutionNotStartedError extends NotFoundError {
  constructor() {
    super('EXECUTION_NOT_STARTED', 'No inspection execution found for this appointment');
  }
}

export class ExecutionAssetUploadPendingError extends DomainError {
  constructor() {
    super('EXECUTION_ASSET_UPLOAD_PENDING', 'Referenced asset not yet confirmed as uploaded', 422);
  }
}

export class ExecutionInsufficientAssetsError extends DomainError {
  constructor() {
    super('EXECUTION_INSUFFICIENT_ASSETS', 'Minimum required assets not met', 422);
  }
}

export class IdempotencyKeyMissingError extends DomainError {
  constructor() {
    super('IDEMPOTENCY_KEY_MISSING', 'Idempotency-Key header is required', 400);
  }
}

export class AssetMimeTypeNotAllowedError extends DomainError {
  constructor() {
    super('ASSET_MIME_TYPE_NOT_ALLOWED', 'MIME type not allowed for this asset kind', 422);
  }
}

export class AssetNotFoundError extends NotFoundError {
  constructor() {
    super('ASSET_NOT_FOUND', 'Asset not found or not owned by this inspector');
  }
}

export class AssetUploadExpiredError extends DomainError {
  constructor() {
    super('ASSET_UPLOAD_EXPIRED', 'Presigned upload URL has expired', 410);
  }
}

export class AssetUploadNotFoundInStorageError extends DomainError {
  constructor() {
    super('ASSET_UPLOAD_NOT_FOUND_IN_STORAGE', 'Upload not found in storage', 422);
  }
}
