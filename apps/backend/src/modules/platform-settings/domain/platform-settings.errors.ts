import { NotFoundError } from '../../../shared/domain/errors';

export class PlatformSettingUnknownKeyError extends NotFoundError {
  constructor() {
    super('PLATFORM_SETTING_UNKNOWN_KEY', 'Unknown platform setting');
  }
}
