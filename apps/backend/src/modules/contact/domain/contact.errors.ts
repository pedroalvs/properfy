import { DomainError, NotFoundError } from '../../../shared/domain/errors';

export class ContactNotFoundError extends NotFoundError {
  constructor() {
    super('CONTACT_NOT_FOUND', 'Contact not found');
  }
}

export class ContactEmailAlreadyExistsError extends DomainError {
  constructor() {
    super('CONTACT_EMAIL_ALREADY_EXISTS', 'An active contact with this email already exists in this tenant', 409);
  }
}

export class ContactPhoneAlreadyExistsError extends DomainError {
  constructor() {
    super('CONTACT_PHONE_ALREADY_EXISTS', 'An active contact with this phone already exists in this tenant', 409);
  }
}

export class ContactChannelDuplicatedError extends DomainError {
  constructor(message?: string) {
    super('CONTACT_CHANNEL_DUPLICATED', message ?? 'Additional channel duplicates primary email/phone or contains duplicates');
  }
}

export class ContactNoChannelError extends DomainError {
  constructor() {
    super('CONTACT_NO_CHANNEL', 'At least one of primaryEmail or primaryPhone is required');
  }
}
