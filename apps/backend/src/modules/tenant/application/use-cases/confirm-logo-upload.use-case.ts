import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ITenantRepository } from '../../domain/tenant.repository';
import type { IBrandingStorageService } from '../../domain/branding-storage.service';
import {
  TenantNotFoundError,
  LogoStorageKeyInvalidError,
  LogoUploadObjectNotFoundError,
} from '../../domain/tenant.errors';
import { deepMerge } from '../../../../shared/domain/utils';

// tenants/<uuid>/branding/logo.<ext>
const LOGO_KEY_REGEX = /^tenants\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/branding\/logo\.(png|jpe?g|webp|svg)$/i;

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

    // Validate storage key format
    if (!LOGO_KEY_REGEX.test(storageKey)) {
      throw new LogoStorageKeyInvalidError();
    }

    // Verify tenant exists
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || tenant.isDeleted()) {
      throw new TenantNotFoundError();
    }

    // Verify object exists in storage
    const head = await this.brandingStorage.headObject(storageKey);
    if (!head.exists) {
      throw new LogoUploadObjectNotFoundError();
    }

    // Construct public URL
    const logoUrl = this.brandingStorage.getPublicUrl(storageKey);

    // Update tenant settings with logoUrl and logoStorageKey via deep merge
    const previousLogoUrl = (tenant.settingsJson.logoUrl as string | undefined) ?? null;
    const updatedSettings = deepMerge(tenant.settingsJson, { logoUrl, logoStorageKey: storageKey });

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
      after: { logoUrl, logoStorageKey: storageKey },
    });

    return { logoUrl };
  }
}
