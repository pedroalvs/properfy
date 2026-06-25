import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IEmailAssetRepository } from '../../domain/email-asset.repository';
import type { IEmailAssetStorageService } from '../../domain/email-asset-storage.service';
import { ConflictError, ValidationError } from '../../../../shared/domain/errors';

export interface RequestImageUploadInput {
  placeholderKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  tenantId?: string;
  actor: AuthContext;
}

export interface RequestImageUploadOutput {
  id: string;
  uploadUrl: string;
  storageKey: string;
  publicUrl: string;
}

/** Generates a presigned PUT URL for uploading an email asset to the public bucket. */
export class RequestImageUploadUseCase {
  constructor(
    private readonly emailAssetRepo: IEmailAssetRepository,
    private readonly storageService: IEmailAssetStorageService,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: RequestImageUploadInput): Promise<RequestImageUploadOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'email_assets.upload',
      entityType: 'EmailAsset',
    });

    const tenantId = input.actor.role === 'AM' ? (input.tenantId ?? null) : (input.actor.tenantId ?? null);

    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(input.placeholderKey)) {
      throw new ValidationError('Invalid placeholder key format');
    }

    const existing = await this.emailAssetRepo.findByPlaceholderKey(tenantId, input.placeholderKey);
    if (existing) {
      throw new ConflictError('PLACEHOLDER_KEY_EXISTS', `Placeholder key '${input.placeholderKey}' already exists`);
    }

    const id = crypto.randomUUID();
    const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const tenantPath = tenantId ?? 'platform';
    const storageKey = `tenants/${tenantPath}/library/${id}-${safeFilename}`;

    const { uploadUrl, publicUrl } = await this.storageService.presignUpload(storageKey, input.contentType);

    await this.emailAssetRepo.create({
      id,
      tenantId,
      placeholderKey: input.placeholderKey,
      storageKey,
      publicUrl,
      originalFilename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      uploadedByUserId: input.actor.userId,
    });

    this.auditService.log({
      action: 'EMAIL_ASSET_UPLOAD_REQUESTED',
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'EMAIL_ASSET',
      entityId: id,
      tenantId: tenantId ?? undefined,
      after: { placeholderKey: input.placeholderKey, storageKey },
    });

    return { id, uploadUrl, storageKey, publicUrl };
  }
}
