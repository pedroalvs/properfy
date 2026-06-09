import { NotFoundError } from '../../../shared/domain/errors';

export class AppCredentialNotFoundError extends NotFoundError {
  constructor() {
    super('APP_CREDENTIAL_NOT_FOUND', 'App credential not found');
  }
}
