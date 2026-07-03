import type {
  IAppCredentialRepository,
  AppCredentialUpdateData,
} from '../../domain/app-credential.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import type { AppCredentialEntity } from '../../domain/app-credential.entity';
import {
  AppCredentialNotFoundError,
  AppCredentialAuthCodeRequiredError,
  AppCredentialBranchInvalidError,
} from '../../domain/app-credential.errors';

export interface UpdateAppCredentialInput {
  id: string;
  actorId: string;
  actorTenantId?: string | null;
  data: AppCredentialUpdateData;
}

export class UpdateAppCredentialUseCase {
  constructor(
    private readonly repo: IAppCredentialRepository,
    private readonly auditService: AuditService,
    private readonly branchRepo: Pick<IBranchRepository, 'findById'>,
  ) {}

  async execute(input: UpdateAppCredentialInput): Promise<AppCredentialEntity> {
    const existing = await this.repo.findById(input.id);
    if (!existing) {
      throw new AppCredentialNotFoundError();
    }

    // The needsAuthCode ⇒ authCode invariant must hold on the MERGED state —
    // a partial patch cannot be validated by the input schema alone.
    const mergedNeedsAuthCode = input.data.needsAuthCode ?? existing.needsAuthCode;
    const mergedAuthCode =
      input.data.authCode !== undefined ? input.data.authCode : existing.authCode;
    if (mergedNeedsAuthCode && !mergedAuthCode) {
      throw new AppCredentialAuthCodeRequiredError();
    }

    // Multi-tenant safety: a new branch must belong to the credential's tenant.
    if (input.data.branchId) {
      const branch = await this.branchRepo.findById(input.data.branchId, existing.tenantId);
      if (!branch) {
        throw new AppCredentialBranchInvalidError();
      }
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
      // Never log secret values (record only whether they changed).
      after: {
        name: updated.name,
        username: updated.username,
        branchId: updated.branchId,
        needsAuthCode: updated.needsAuthCode,
        appUrl: updated.appUrl,
        instructionsUrl: updated.instructionsUrl,
        isActive: updated.isActive,
        passwordChanged: input.data.password !== undefined,
        authCodeChanged: input.data.authCode !== undefined,
        instructionsPasswordChanged: input.data.instructionsPassword !== undefined,
      },
    });

    return updated;
  }
}
