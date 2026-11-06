import type { AuthContext, InspectorAlertThresholdsResponse } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import {
  parseAlertOverride,
  resolveEffectiveThresholds,
} from '../../../live-day/domain/resolve-effective-thresholds';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import { InspectorNotFoundError } from '../../domain/inspector.errors';

export interface GetInspectorAlertThresholdsInput {
  inspectorId: string;
  actor: AuthContext;
}

/**
 * Reads an inspector's Live Day alert thresholds (F05-1, US5): the platform defaults,
 * the per-inspector override (null fields = "use the default"), and the resolved
 * effective values with their source. AM/OP only (the override is platform-scoped, no
 * `tenant_id`). The role gate runs before the lookup so a 403 is not an existence oracle.
 */
export class GetInspectorAlertThresholdsUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly platformSettings: IPlatformSettingsReader,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute({ inspectorId, actor }: GetInspectorAlertThresholdsInput): Promise<InspectorAlertThresholdsResponse> {
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'inspector.alert_thresholds_read',
      entityType: 'Inspector',
    });

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector) throw new InspectorNotFoundError();

    const platformDefaults = await this.platformSettings.get('liveDayAlerts');
    const override = parseAlertOverride(await this.inspectorRepo.getAlertOverrides(inspectorId));
    const effective = resolveEffectiveThresholds(override, platformDefaults);

    return {
      inspectorId,
      platformDefaults: {
        delayMinutes: platformDefaults.delayMinutes,
        notStartedMinutes: platformDefaults.notStartedMinutes,
      },
      override: { delayMinutes: override.delayMinutes, notStartedMinutes: override.notStartedMinutes },
      effective: { delayMinutes: effective.delayMinutes, notStartedMinutes: effective.notStartedMinutes },
    };
  }
}
