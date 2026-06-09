import type { IAppCredentialRepository } from '../../domain/app-credential.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AppCredentialEntity } from '../../domain/app-credential.entity';
import { AppCredentialNotFoundError } from '../../domain/app-credential.errors';

export interface UpdateAppCredentialInput {
  id: string;
  actorId: string;
  actorTenantId?: string | null;
  data: Partial<{
    name: string;
    username: string;
    password: string;
    isActive: boolean;
  }>;
}

export class UpdateAppCredentialUseCase {
  constructor(
    private readonly repo: IAppCredentialRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpdateAppCredentialInput): Promise<AppCredentialEntity> {
    const existing = await this.repo.findById(input.id);
    if (!existing) {
      throw new AppCredentialNotFoundError();
    }

    await this.repo.update(input.id, input.data);

    const updated = await this.repo.findById(input.id);
    if (!updated) {
      throw new AppCredentialNotFoundError();
    }

    // Distinguish (de)activation from a content edit for a clearer audit trail.
    let action = 'app_credential.updated';
    if (input.data.isActive === true && !existing.isActive) {
      action = 'app_credential.reactivated';
    } else if (input.data.isActive === false && existing.isActive) {
      action = 'app_credential.deactivated';
    }

    this.auditService.log({
      action,
      actorType: 'USER',
      actorId: input.actorId,
      entityType: 'app_credential',
      entityId: updated.id,
      tenantId: updated.tenantId,
      metadata: { actor_tenant_id: input.actorTenantId ?? null },
      // Never log the password value (record only whether it changed).
      after: {
        name: updated.name,
        username: updated.username,
        isActive: updated.isActive,
        passwordChanged: input.data.password !== undefined,
      },
    });

    return updated;
  }
}
