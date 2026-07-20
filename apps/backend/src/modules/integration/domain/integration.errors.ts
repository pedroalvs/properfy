import { NotFoundError, ValidationError } from '../../../shared/domain/errors';

export class IntegrationSettingNotFoundError extends NotFoundError {
  constructor() {
    super('INTEGRATION_SETTING_NOT_FOUND', 'Integration is not configured in the database');
  }
}

export class IntegrationConfigInvalidError extends ValidationError {
  constructor(details: Array<{ field: string; message: string }>) {
    super('Integration config is invalid', details, 'INTEGRATION_CONFIG_INVALID');
  }
}

export class ApiKeyNotFoundError extends NotFoundError {
  constructor() {
    super('API_KEY_NOT_FOUND', 'API key not found');
  }
}
