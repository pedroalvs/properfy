import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ITenantRepository } from '../../domain/tenant.repository';
import type { IBrandingStorageService } from '../../domain/branding-storage.service';
import { TenantNotFoundError } from '../../domain/tenant.errors';
import { deepMerge } from '../../../../shared/domain/utils';

export interface ConfirmLogoUploadInput {
  tenantId: string;
  storageKey: string;
  actor: AuthContext;
}

export interface ConfirmLogoUploadOutput {
  logoUrl: string;
}

export class ConfirmLogoUploadUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly brandingStorage: IBrandingStorageService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: ConfirmLogoUploadInput): Promise<ConfirmLogoUploadOutput> {
    const { tenantId, storageKey, actor } = input;

    // RBAC: AM can confirm for any tenant, CL_ADMIN own tenant only
    if (actor.role === 'AM') {
      // Full access
    } else if (actor.role === 'CL_ADMIN' && actor.tenantId === tenantId) {
      // Own tenant only
    } else {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to update logo');
    }

    // Verify tenant exists
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || tenant.isDeleted()) {
      throw new TenantNotFoundError();
    }

    // Construct public URL
    const logoUrl = this.brandingStorage.getPublicUrl(storageKey);

    // Update tenant settings with logoUrl via deep merge
    const previousLogoUrl = (tenant.settingsJson.logoUrl as string | undefined) ?? null;
    const updatedSettings = deepMerge(tenant.settingsJson, { logoUrl });

    await this.tenantRepo.update(tenantId, { settingsJson: updatedSettings });

    // Audit
    this.auditService.log({
      action: 'tenant.logo_updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Tenant',
      entityId: tenantId,
      tenantId,
      before: { logoUrl: previousLogoUrl },
      after: { logoUrl },
    });

    return { logoUrl };
  }
}
