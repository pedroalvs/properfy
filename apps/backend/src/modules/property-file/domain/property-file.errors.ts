import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from '../../../shared/domain/errors';
import { FILE_STORAGE_UNAVAILABLE_MESSAGE } from '@properfy/shared';

/** Cross-tenant or out-of-scope access MUST 404, never reveal existence (C.A2). */
export class PropertyFileNotFoundError extends NotFoundError {
  constructor() {
    super('PROPERTY_FILE_NOT_FOUND', 'Property file not found.');
  }
}

export class PropertyIssueNotFoundError extends NotFoundError {
  constructor() {
    super('PROPERTY_ISSUE_NOT_FOUND', 'Property issue not found.');
  }
}

export class PropertyNotFoundError extends NotFoundError {
  constructor() {
    super('PROPERTY_NOT_FOUND', 'Property not found.');
  }
}

/** A declared or sniffed MIME outside the configured allow-list (C.A5). */
export class PropertyFileMimeNotAllowedError extends ValidationError {
  constructor(message = 'This file type is not allowed.') {
    super(message, undefined, 'PROPERTY_FILE_MIME_NOT_ALLOWED');
  }
}

/** The uploaded object is larger than the configured maximum (C.A5, confirm side). */
export class PropertyFileTooLargeError extends ValidationError {
  constructor(maxFileSizeMb: number) {
    super(
      `The file is larger than the ${maxFileSizeMb} MB limit.`,
      undefined,
      'PROPERTY_FILE_TOO_LARGE',
    );
  }
}

/** The object's magic bytes do not match the declared type (C.A5, confirm side). */
export class PropertyFileContentMismatchError extends ValidationError {
  constructor() {
    super(
      'The uploaded file does not match its declared type.',
      undefined,
      'PROPERTY_FILE_CONTENT_MISMATCH',
    );
  }
}

/** The presigned object does not exist in storage at confirm time. */
export class PropertyFileObjectMissingError extends ValidationError {
  constructor() {
    super(
      'The uploaded file was not found in storage. Please upload it again.',
      undefined,
      'PROPERTY_FILE_OBJECT_MISSING',
    );
  }
}

/** An appointment that does not belong to the issue's property + tenant (D1). */
export class PropertyIssueAppointmentMismatchError extends ValidationError {
  constructor() {
    super(
      'The appointment does not belong to this property.',
      undefined,
      'PROPERTY_ISSUE_APPOINTMENT_MISMATCH',
    );
  }
}

/** Too many photos for one issue (over `maxPhotosPerIssue`). */
export class PropertyIssueTooManyPhotosError extends ValidationError {
  constructor(max: number) {
    super(`An issue can have at most ${max} photos.`, undefined, 'PROPERTY_ISSUE_TOO_MANY_PHOTOS');
  }
}

/**
 * At least one referenced photo could not be linked to the new issue — it is
 * missing, already linked, not a PENDING issue photo, or belongs to another
 * tenant (D20). The whole issue creation is rolled back.
 */
export class PropertyIssuePhotoLinkError extends ConflictError {
  constructor() {
    super(
      'PROPERTY_ISSUE_PHOTO_LINK_FAILED',
      'One or more photos could not be attached to the issue. Please re-upload and try again.',
    );
  }
}

/** `Idempotency-Key` header missing on a critical command (D24). */
export class PropertyFileIdempotencyKeyMissingError extends ValidationError {
  constructor() {
    super('An Idempotency-Key header is required.', undefined, 'IDEMPOTENCY_KEY_REQUIRED');
  }
}

/** Same key replayed with a different payload (D24). */
export class PropertyFileIdempotencyMismatchError extends ConflictError {
  constructor() {
    super(
      'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
      'This Idempotency-Key was already used with a different request.',
    );
  }
}

/** An action a role may not perform (e.g. CL_USER presign, INSP delete). */
export class PropertyFileForbiddenError extends ForbiddenError {
  constructor(message = 'You are not allowed to perform this action.') {
    super('FORBIDDEN', message);
  }
}

/** Re-export so routes/use cases surface the one shared unavailable message (D16). */
export { FILE_STORAGE_UNAVAILABLE_MESSAGE };
