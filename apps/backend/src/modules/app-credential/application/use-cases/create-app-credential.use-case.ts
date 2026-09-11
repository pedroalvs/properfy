import type { IAppCredentialRepository } from '../../domain/app-credential.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import { AppCredentialEntity } from '../../domain/app-credential.entity';
import {
  AppCredentialBranchInvalidError,
  AppCredentialTenantInvalidError,
} from '../../domain/app-credential.errors';

export interface CreateAppCredentialInput {
  tenantId: string;
  branchId?: string | null;
  name: string;
  username: string;
  password: string;
  needsAuthCode?: boolean;
  appUrl?: string | null;
  instructionsUrl?: string | null;
  instructionsPassword?: string | null;
  isDefault?: boolean;
  actorId: string;
  /** Actor's own JWT tenant (AM may be null), recorded for audit traceability. */
  actorTenantId?: string | null;
}

export class CreateAppCredentialUseCase {
  constructor(
    private readonly repo: IAppCredentialRepository,
    private readonly auditService: AuditService,
    private readonly branchRepo: Pick<IBranchRepository, 'findById'>,
    private readonly tenantRepo: Pick<ITenantRepository, 'findById'>,
  ) {}

  async execute(input: CreateAppCredentialInput): Promise<AppCredentialEntity> {
    // AM/OP create credentials cross-tenant (tenantId comes from the body, not
    // the JWT — AM/OP tokens carry tenantId: null). Validate the supplied tenant
    // exists and is active before persisting, so a deactivated agency can't be
    // targeted and a nonexistent id fails as a clean 400 rather than an FK 500.
    const tenant = await this.tenantRepo.findById(input.tenantId);
    if (!tenant || !tenant.isActive()) {
      throw new AppCredentialTenantInvalidError();
    }

    // Multi-tenant safety: the branch (when given) must belong to the owning
    // tenant. findById is tenant-scoped, so a cross-tenant id resolves to null.
    if (input.branchId) {
      const branch = await this.branchRepo.findById(input.branchId, input.tenantId);
      if (!branch) {
        throw new AppCredentialBranchInvalidError();
      }
    }

    const now = new Date();
    const credential = new AppCredentialEntity({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      branchId: input.branchId ?? null,
      name: input.name,
      username: input.username,
      password: input.password,
      needsAuthCode: input.needsAuthCode ?? false,
      appUrl: input.appUrl ?? null,
      instructionsUrl: input.instructionsUrl ?? null,
      instructionsPassword: input.instructionsPassword ?? null,
      isActive: true,
      isDefault: input.isDefault ?? false,
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
      // Never log secret values (password, instructionsPassword).
      after: {
        name: credential.name,
        username: credential.username,
        branchId: credential.branchId,
        needsAuthCode: credential.needsAuthCode,
        appUrl: credential.appUrl,
        instructionsUrl: credential.instructionsUrl,
        isDefault: credential.isDefault,
      },
    });

    return credential;
  }
}
