import type {
  AuthContext,
  InspectorAlertThresholdsResponse,
  UpdateInspectorAlertThresholdsInput as ThresholdsBody,
} from '@properfy/shared';
import type { AuditService } from '../../../../shared/domain/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import {
  parseAlertOverride,
  resolveEffectiveThresholds,
} from '../../../live-day/domain/resolve-effective-thresholds';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import { InspectorNotFoundError } from '../../domain/inspector.errors';

export interface UpdateInspectorAlertThresholdsInput {
  inspectorId: string;
  actor: AuthContext;
  input: ThresholdsBody;
}

/**
 * Sets (or clears) an inspector's Live Day alert override (F05-1, US5). AM/OP only,
 * platform-scoped (audited with `tenantId: null`). Last-write-wins; a write equal to
 * the stored value is a no-op with no audit entry. Both fields `null` clears the
 * override (stored as DB NULL). Returns the same shape as the GET.
 */
export class UpdateInspectorAlertThresholdsUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly platformSettings: IPlatformSettingsReader,
    private readonly authorizationService: AuthorizationService,
    private readonly auditService: AuditService,
  ) {}

  async execute({ inspectorId, actor, input }: UpdateInspectorAlertThresholdsInput): Promise<InspectorAlertThresholdsResponse> {
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'inspector.alert_thresholds_updated',
      entityType: 'Inspector',
    });

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector) throw new InspectorNotFoundError();

    const current = parseAlertOverride(await this.inspectorRepo.getAlertOverrides(inspectorId));
    const next = { delayMinutes: input.delayMinutes, notStartedMinutes: input.notStartedMinutes };
    const changed =
      current.delayMinutes !== next.delayMinutes || current.notStartedMinutes !== next.notStartedMinutes;

    if (changed) {
      const storeValue =
        next.delayMinutes === null && next.notStartedMinutes === null
          ? null
          : { delayMinutes: next.delayMinutes, notStartedMinutes: next.notStartedMinutes };
      await this.inspectorRepo.setAlertOverrides(inspectorId, storeValue);
      this.auditService.log({
        action: 'inspector.alert_thresholds_updated',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'Inspector',
        entityId: inspectorId,
        tenantId: null,
        before: current,
        after: next,
        metadata: { updatedByRole: actor.role },
      });
    }

    const platformDefaults = await this.platformSettings.get('liveDayAlerts');
    const effective = resolveEffectiveThresholds(next, platformDefaults);
    return {
      inspectorId,
      platformDefaults: {
        delayMinutes: platformDefaults.delayMinutes,
        notStartedMinutes: platformDefaults.notStartedMinutes,
      },
      override: next,
      effective: { delayMinutes: effective.delayMinutes, notStartedMinutes: effective.notStartedMinutes },
    };
  }
}
