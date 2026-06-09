import type { IAppCredentialRepository } from '../../domain/app-credential.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { AppCredentialEntity } from '../../domain/app-credential.entity';

export interface CreateAppCredentialInput {
  tenantId: string;
  name: string;
  username: string;
  password: string;
  actorId: string;
  /** Actor's own JWT tenant (AM may be null), recorded for audit traceability. */
  actorTenantId?: string | null;
}

export class CreateAppCredentialUseCase {
  constructor(
    private readonly repo: IAppCredentialRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: CreateAppCredentialInput): Promise<AppCredentialEntity> {
    const now = new Date();
    const credential = new AppCredentialEntity({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      name: input.name,
      username: input.username,
      password: input.password,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    await this.repo.save(credential);

    this.auditService.log({
      action: 'app_credential.created',
      actorType: 'USER',
      actorId: input.actorId,
      entityType: 'app_credential',
      entityId: credential.id,
      tenantId: input.tenantId,
      metadata: { actor_tenant_id: input.actorTenantId ?? null },
      // Never log the password value.
      after: { name: credential.name, username: credential.username },
    });

    return credential;
  }
}
