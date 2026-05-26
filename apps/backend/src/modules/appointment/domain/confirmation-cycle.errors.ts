import { DomainError, NotFoundError, ConflictError } from '../../../shared/domain/errors';

export class ConfirmationCycleNotFoundError extends NotFoundError {
  constructor() {
    super('CONFIRMATION_CYCLE_NOT_FOUND', 'No active confirmation cycle found for this appointment');
  }
}

export class ConfirmationCycleAlreadyTerminalError extends DomainError {
  constructor() {
    super('CONFIRMATION_CYCLE_ALREADY_TERMINAL', 'Cannot mutate a SUPERSEDED confirmation cycle', 422);
  }
}

export class PortalTokenNotDecryptableError extends ConflictError {
  constructor() {
    super('PORTAL_TOKEN_NOT_DECRYPTABLE', 'Active portal token cannot be decrypted — send a new portal link to generate a fresh one');
  }
}

export class ConfirmationCycleStateError extends DomainError {
  constructor(message: string) {
    super('CONFIRMATION_CYCLE_STATE_ERROR', message, 422);
  }
}
