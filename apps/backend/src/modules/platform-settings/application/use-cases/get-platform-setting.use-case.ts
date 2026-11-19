import {
  isPlatformSettingKey,
  type AuthContext,
  type PlatformSettingResponse,
} from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IPlatformSettingRepository } from '../../domain/platform-setting.repository';
import { PlatformSettingUnknownKeyError } from '../../domain/platform-settings.errors';
import { toPlatformSettingResponse } from '../platform-setting-response.mapper';

export class GetPlatformSettingUseCase {
  constructor(
    private readonly repository: IPlatformSettingRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: { key: string; actor: AuthContext }): Promise<PlatformSettingResponse> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'platform_settings.view',
      entityType: 'PlatformSetting',
    });

    if (!isPlatformSettingKey(input.key)) {
      throw new PlatformSettingUnknownKeyError();
    }

    const row = await this.repository.findByKey(input.key);
    return toPlatformSettingResponse(input.key, row);
  }
}
