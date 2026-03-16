import { NotFoundError, DomainError, ForbiddenError } from '../../../shared/domain/errors';

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
