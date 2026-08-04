import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { ITenantRepository } from '../../domain/tenant.repository';
import type { IBrandingStorageService } from '../../domain/branding-storage.service';
import { TenantNotFoundError, TenantLogoNotFoundError } from '../../domain/tenant.errors';
import { assertCanManageLogo } from './upload-tenant-logo.use-case';

export interface DeleteTenantLogoInput {
  tenantId: string;
  actor: AuthContext;
}

export class DeleteTenantLogoUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly brandingStorage: IBrandingStorageService,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
  ) {}

  async execute(input: DeleteTenantLogoInput): Promise<void> {
    const { tenantId, actor } = input;

    assertCanManageLogo(actor, tenantId);

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || tenant.isDeleted()) {
      throw new TenantNotFoundError();
    }

    const storageKey =
      typeof tenant.settingsJson.logoStorageKey === 'string'
        ? tenant.settingsJson.logoStorageKey
        : null;
    if (!storageKey) {
      throw new TenantLogoNotFoundError();
    }
    const previousLogoUrl =
      typeof tenant.settingsJson.logoUrl === 'string' ? tenant.settingsJson.logoUrl : null;

    // Destructure rather than deepMerge: a merge cannot delete keys, and the
    // repo replaces the whole JSON column, so a full object without the two
    // logo keys is the removal.
    const { logoUrl: _logoUrl, logoStorageKey: _logoStorageKey, ...remainingSettings } =
      tenant.settingsJson;

    // DB first: once this commits no template can render the URL, so a failed
    // storage delete only leaks an orphaned file, never a broken email image.
    await this.tenantRepo.update(tenantId, { settingsJson: remainingSettings });

    try {
      await this.brandingStorage.deleteObject(storageKey);
    } catch (error) {
      this.logger.warn(
        { tenantId, storageKey, error },
        'Failed to delete tenant logo object after settings removal',
      );
    }

    this.auditService.log({
      action: 'tenant.logo_deleted',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Tenant',
      entityId: tenantId,
      tenantId,
      before: { logoUrl: previousLogoUrl },
      after: { logoUrl: null },
    });
  }
}
