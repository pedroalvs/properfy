import {
  PLATFORM_SETTINGS_REGISTRY,
  isPlatformSettingKey,
  resolvePlatformSettingValue,
  type AuthContext,
  type PlatformSettingKey,
  type PlatformSettingResponse,
} from '@properfy/shared';
import { ValidationError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/domain/audit';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { PLATFORM_SETTING_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IPlatformSettingRepository } from '../../domain/platform-setting.repository';
import { PlatformSettingUnknownKeyError } from '../../domain/platform-settings.errors';
import {
  PLATFORM_SETTING_SAVE_HOOKS,
  type PlatformSettingSaveHooks,
} from '../platform-setting-save-hooks';
import { toPlatformSettingResponse } from '../platform-setting-response.mapper';

/** Only the cache-invalidation capability of PlatformSettingsService is needed here. */
export interface PlatformSettingsInvalidator {
  invalidate(key: PlatformSettingKey): void;
}

export interface PlatformSettingsUpdateLogger {
  info(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export class UpdatePlatformSettingUseCase {
  constructor(
    private readonly repository: IPlatformSettingRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly auditService: AuditService,
    private readonly settingsCache: PlatformSettingsInvalidator,
    private readonly eventBus: DomainEventBus,
    private readonly logger: PlatformSettingsUpdateLogger,
    private readonly saveHooks: PlatformSettingSaveHooks = PLATFORM_SETTING_SAVE_HOOKS,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: {
    key: string;
    value: unknown;
    actor: AuthContext;
  }): Promise<PlatformSettingResponse> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'platform_settings.update',
      entityType: 'PlatformSetting',
      entityId: input.key,
    });

    if (!isPlatformSettingKey(input.key)) {
      throw new PlatformSettingUnknownKeyError();
    }
    const key = input.key;

    const parsed = PLATFORM_SETTINGS_REGISTRY[key].schema.safeParse(input.value);
    if (!parsed.success) {
      throw new ValidationError('Platform setting value is invalid', parsed.error.issues);
    }

    // Effective previous value (defaults when there is no row) — the audit/event `before`.
    const previousRow = await this.repository.findByKey(key);
    const before = resolvePlatformSettingValue(key, previousRow?.valueJson ?? null).value;

    // Save hook (if any) runs AFTER validation and BEFORE the write.
    const now = this.now();
    const hook = this.saveHooks[key];
    const after = hook
      ? (hook as (p: unknown, n: unknown, now: Date) => unknown)(before, parsed.data, now)
      : parsed.data;

    const row = await this.repository.upsert(key, after, input.actor.userId);

    this.auditService.log({
      action: 'platform_setting.updated',
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'PlatformSetting',
      entityId: key,
      tenantId: null,
      before,
      after,
      metadata: { actor_tenant_id: input.actor.tenantId ?? null },
    });

    this.settingsCache.invalidate(key);
    this.logger.info({ key, actorId: input.actor.userId }, 'Platform setting updated');

    // Fire-and-forget: a subscriber must never fail the PUT. The bus itself uses
    // Promise.allSettled; the extra guard logs if emit rejects for any reason.
    const occurredAt = now.toISOString();
    try {
      await this.eventBus.emit({
        type: PLATFORM_SETTING_EVENTS.UPDATED,
        payload: { key, before, after, actorId: input.actor.userId, occurredAt },
        occurredAt: now,
      });
    } catch (err) {
      this.logger.error({ key, err }, 'platform_setting.updated.v1 subscriber failed');
    }

    return toPlatformSettingResponse(key, row);
  }
}
