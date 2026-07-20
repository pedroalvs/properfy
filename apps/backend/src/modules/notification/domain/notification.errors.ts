import { NotFoundError, DomainError, ForbiddenError, ValidationError } from '../../../shared/domain/errors';
import type { NotificationClass } from '@properfy/shared';

export class NotificationNotFoundError extends NotFoundError {
  constructor() {
    super('NOTIFICATION_NOT_FOUND', 'Notification not found');
  }
}

export class NotificationInvalidStatusError extends DomainError {
  constructor(message?: string) {
    super('NOTIFICATION_INVALID_STATUS', message ?? 'Notification is not in the expected status', 422);
  }
}

export class TemplateNotFoundError extends NotFoundError {
  constructor() {
    super('TEMPLATE_NOT_FOUND', 'Notification template not found');
  }
}

export class NotificationForbiddenError extends ForbiddenError {
  constructor() {
    super('FORBIDDEN', 'Not permitted for this operation');
  }
}

/**
 * Feature 018: thrown when an operator attempts to reclassify a protected template
 * (e.g., INSPECTION_CONFIRMED cannot be OPERATIONAL — it must remain TRANSACTIONAL).
 */
export class ProtectedTemplateClassificationError extends ValidationError {
  constructor(public readonly templateCode: string, public readonly requiredClass: NotificationClass) {
    super(
      `Template "${templateCode}" is protected and must be classified as ${requiredClass}. It cannot be reclassified.`,
      { templateCode, requiredClass },
      'PROTECTED_TEMPLATE_CLASSIFICATION',
    );
  }
}

/**
 * Feature 018: thrown when a consent record lookup by id fails.
 */
export class NotificationConsentNotFoundError extends NotFoundError {
  constructor() {
    super('CONSENT_NOT_FOUND', 'Notification consent record not found');
  }
}

/**
 * Feature 018: thrown when a consent operator override violates tenant scope.
 */
export class ConsentTenantScopeError extends ForbiddenError {
  constructor() {
    super('TENANT_SCOPE_VIOLATION', 'Operator cannot modify consent records belonging to another tenant');
  }
}

/**
 * Thrown when a caller attempts to dispatch a MARKETING-class notification.
 * Marketing dispatch is not enabled — no opt-in endpoint exists.
 */
export class MarketingDispatchDisabledError extends DomainError {
  constructor() {
    super('MARKETING_DISPATCH_DISABLED', 'Marketing notifications cannot be dispatched — feature not enabled', 422);
  }
}
