import {
  PLATFORM_SETTINGS_REGISTRY,
  type AuthContext,
  type PlatformSettingKey,
  type PlatformSettingsListResponse,
} from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IPlatformSettingRepository } from '../../domain/platform-setting.repository';
import { toPlatformSettingResponse } from '../platform-setting-response.mapper';

export class ListPlatformSettingsUseCase {
  constructor(
    private readonly repository: IPlatformSettingRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: { actor: AuthContext }): Promise<PlatformSettingsListResponse> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'platform_settings.view',
      entityType: 'PlatformSetting',
    });

    const rows = await this.repository.findAll();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const keys = Object.keys(PLATFORM_SETTINGS_REGISTRY) as PlatformSettingKey[];

    const settings = keys
      .map((key) => toPlatformSettingResponse(key, byKey.get(key) ?? null))
      .sort((a, b) => a.section.localeCompare(b.section));

    return { settings };
  }
}
