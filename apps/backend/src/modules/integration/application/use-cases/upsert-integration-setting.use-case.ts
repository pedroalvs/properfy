import {
  integrationConfigSchemas,
  type IntegrationDetail,
  type IntegrationProvider,
} from '@properfy/shared';

import type { AuditService } from '../../../../shared/infrastructure/audit';
import {
  REQUIRED_CONFIG_KEYS,
  type IIntegrationSettingRepository,
  type IntegrationConfig,
} from '../../domain/integration-setting';
import { IntegrationConfigInvalidError } from '../../domain/integration.errors';
import type { IntegrationConfigResolver } from '../../infrastructure/integration-config-resolver';
import { maskIntegrationConfig } from '../mask-integration-config';

export interface UpsertIntegrationSettingInput {
  provider: IntegrationProvider;
  config: Record<string, unknown>;
  enabled?: boolean;
  actorId: string;
}

export class UpsertIntegrationSettingUseCase {
  constructor(
    private readonly repo: IIntegrationSettingRepository,
    private readonly resolver: IntegrationConfigResolver,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpsertIntegrationSettingInput): Promise<IntegrationDetail> {
    const parsed = integrationConfigSchemas[input.provider].safeParse(input.config);
    if (!parsed.success) {
      throw new IntegrationConfigInvalidError(
        parsed.error.errors.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    // Secrets are write-only: fields omitted from the payload preserve the
    // stored value, so the UI can update e.g. only fromEmail without ever
    // round-tripping the API key.
    const existing = await this.repo.get(input.provider);
    const merged: IntegrationConfig = { ...(existing?.config ?? {}) };
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) merged[key] = value;
    }

    const enabled = input.enabled ?? existing?.enabled ?? true;
    const row = await this.repo.upsert(input.provider, merged, enabled, input.actorId);
    this.resolver.invalidate(input.provider);

    this.auditService.log({
      action: 'integration_setting.upserted',
      actorType: 'USER',
      actorId: input.actorId,
      entityType: 'integration_setting',
      entityId: input.provider,
      tenantId: null,
      // Never log secret values — record only which keys changed.
      after: { enabled, updatedKeys: Object.keys(parsed.data) },
    });

    const configured = REQUIRED_CONFIG_KEYS[input.provider].every((key) => !!merged[key]);
    return {
      provider: input.provider,
      configured: configured && enabled,
      source: 'database',
      enabled,
      maskedConfig: maskIntegrationConfig(input.provider, merged),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
