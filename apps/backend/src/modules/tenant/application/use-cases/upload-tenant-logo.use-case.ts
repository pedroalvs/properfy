import { fileTypeFromBuffer } from 'file-type';
import { imageSize } from 'image-size';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { ITenantRepository } from '../../domain/tenant.repository';
import type { IBrandingStorageService } from '../../domain/branding-storage.service';
import {
  TenantNotFoundError,
  LogoFileInvalidError,
  LogoFileTooLargeError,
  LogoDimensionsExceededError,
} from '../../domain/tenant.errors';
import { deepMerge } from '../../../../shared/domain/utils';

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_LOGO_DIMENSION_PX = 2000;

// Detected MIME → key extension. Doubles as the allow-list: SVG is excluded on
// purpose (no reliable magic bytes, poor email-client support).
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export interface UploadTenantLogoInput {
  tenantId: string;
  fileBuffer: Buffer;
  actor: AuthContext;
}

export interface UploadTenantLogoOutput {
  logoUrl: string;
}

export class UploadTenantLogoUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly brandingStorage: IBrandingStorageService,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
  ) {}

  async execute(input: UploadTenantLogoInput): Promise<UploadTenantLogoOutput> {
    const { tenantId, fileBuffer, actor } = input;

    assertCanManageLogo(actor, tenantId);

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || tenant.isDeleted()) {
      throw new TenantNotFoundError();
    }

    if (fileBuffer.length > MAX_LOGO_BYTES) {
      throw new LogoFileTooLargeError(MAX_LOGO_BYTES);
    }

    // Trust the bytes, not the client's filename or Content-Type.
    const detected = await fileTypeFromBuffer(fileBuffer);
    const ext = detected ? EXT_BY_MIME[detected.mime] : undefined;
    if (!detected || !ext) {
      throw new LogoFileInvalidError();
    }

    let dimensions: { width?: number; height?: number };
    try {
      dimensions = imageSize(fileBuffer);
    } catch {
      // Passed the signature sniff but does not decode — corrupt image.
      throw new LogoFileInvalidError();
    }
    if (
      (dimensions.width ?? 0) > MAX_LOGO_DIMENSION_PX ||
      (dimensions.height ?? 0) > MAX_LOGO_DIMENSION_PX
    ) {
      throw new LogoDimensionsExceededError(MAX_LOGO_DIMENSION_PX);
    }

    const newKey = `tenants/${tenantId}/branding/logo.${ext}`;

    // Upload first: a storage failure must surface as an error with the DB
    // untouched, never as a settings row pointing at a missing object.
    await this.brandingStorage.upload(newKey, fileBuffer, detected.mime);

    const previousKey =
      typeof tenant.settingsJson.logoStorageKey === 'string'
        ? tenant.settingsJson.logoStorageKey
        : null;
    const previousLogoUrl =
      typeof tenant.settingsJson.logoUrl === 'string' ? tenant.settingsJson.logoUrl : null;
    const logoUrl = this.brandingStorage.getPublicUrl(newKey);

    await this.tenantRepo.update(tenantId, {
      settingsJson: deepMerge(tenant.settingsJson, { logoUrl, logoStorageKey: newKey }),
    });

    // Best-effort: an extension change leaves the old object behind (same key =
    // plain overwrite). An orphaned file must never fail a successful upload.
    if (previousKey && previousKey !== newKey) {
      try {
        await this.brandingStorage.deleteObject(previousKey);
      } catch (error) {
        this.logger.warn(
          { tenantId, previousKey, error },
          'Failed to delete previous tenant logo object',
        );
      }
    }

    this.auditService.log({
      action: 'tenant.logo_updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Tenant',
      entityId: tenantId,
      tenantId,
      before: { logoUrl: previousLogoUrl },
      after: { logoUrl, logoStorageKey: newKey },
    });

    return { logoUrl };
  }
}

export function assertCanManageLogo(actor: AuthContext, tenantId: string): void {
  const isPlatformStaff = actor.role === 'AM' || actor.role === 'OP';
  const isOwnClientAdmin = actor.role === 'CL_ADMIN' && actor.tenantId === tenantId;
  if (!isPlatformStaff && !isOwnClientAdmin) {
    throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to manage logo');
  }
}
