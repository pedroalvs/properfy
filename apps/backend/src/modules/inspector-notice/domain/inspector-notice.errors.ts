import {
  ConflictError,
  DomainError,
  NotFoundError,
  UnprocessableEntityError,
  ValidationError,
} from '../../../shared/domain/errors';

/** Some selected inspectors are not ACTIVE (or do not exist). `details.inspectorIds` lists them. */
export class InspectorNoticeInvalidRecipientsError extends ValidationError {
  constructor(invalidInspectorIds: string[]) {
    super('Some selected inspectors are not active', { inspectorIds: invalidInspectorIds }, 'INSPECTOR_NOTICE_INVALID_RECIPIENTS');
  }
}

/** The targeted region does not exist. */
export class InspectorNoticeRegionNotFoundError extends NotFoundError {
  constructor() {
    super('INSPECTOR_NOTICE_REGION_NOT_FOUND', 'Region not found');
  }
}

/** The targeted region is not active. */
export class InspectorNoticeRegionInactiveError extends UnprocessableEntityError {
  constructor() {
    super('This region is inactive', undefined, 'INSPECTOR_NOTICE_REGION_INACTIVE');
  }
}

/** The audience resolved to zero active inspectors. */
export class InspectorNoticeNoRecipientsError extends UnprocessableEntityError {
  constructor() {
    super('No active inspectors match this audience', undefined, 'INSPECTOR_NOTICE_NO_RECIPIENTS');
  }
}

/** The notice does not exist, or the caller may not see it (no existence leak for INSP). */
export class InspectorNoticeNotFoundError extends NotFoundError {
  constructor() {
    super('INSPECTOR_NOTICE_NOT_FOUND', 'Notice not found');
  }
}

/** The Idempotency-Key header is required for manual publishing. */
export class InspectorNoticeIdempotencyKeyMissingError extends ValidationError {
  constructor() {
    super('Idempotency-Key header is required', undefined, 'IDEMPOTENCY_KEY_MISSING');
  }
}

/** The Idempotency-Key was already used with a different request payload. */
export class InspectorNoticeIdempotencyPayloadMismatchError extends ConflictError {
  constructor() {
    super(
      'INSPECTOR_NOTICE_IDEMPOTENCY_PAYLOAD_MISMATCH',
      'This Idempotency-Key was already used with a different request',
    );
  }
}

/** VAPID keys are not configured, so push cannot be used. */
export class PushNotConfiguredError extends DomainError {
  constructor() {
    super('PUSH_NOT_CONFIGURED', 'Push notifications are not configured', 503);
  }
}
