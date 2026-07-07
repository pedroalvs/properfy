import type { IntegrationProvider } from '@properfy/shared';

import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IIntegrationSettingRepository } from '../../domain/integration-setting';
import { IntegrationSettingNotFoundError } from '../../domain/integration.errors';
import type { IntegrationConfigResolver } from '../../infrastructure/integration-config-resolver';

export interface DeleteIntegrationSettingInput {
  provider: IntegrationProvider;
  actorId: string;
}

/** Removes the database config — the provider reverts to env fallback or stub. */
export class DeleteIntegrationSettingUseCase {
  constructor(
    private readonly repo: IIntegrationSettingRepository,
    private readonly resolver: IntegrationConfigResolver,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: DeleteIntegrationSettingInput): Promise<void> {
    const existing = await this.repo.get(input.provider);
    if (!existing) throw new IntegrationSettingNotFoundError();

    await this.repo.delete(input.provider);
    this.resolver.invalidate(input.provider);

    this.auditService.log({
      action: 'integration_setting.deleted',
      actorType: 'USER',
      actorId: input.actorId,
      entityType: 'integration_setting',
      entityId: input.provider,
      tenantId: null,
    });
  }
}
