import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IEmailAssetRepository } from '../../domain/email-asset.repository';
import type { IEmailAssetStorageService } from '../../domain/email-asset-storage.service';
import type { IImageContentVerifier } from '../../domain/image-content-verifier';
import { NotFoundError, UnprocessableEntityError } from '../../../../shared/domain/errors';

export interface ConfirmImageUploadInput {
  assetId: string;
  actor: AuthContext;
}

export interface ConfirmImageUploadOutput {
  id: string;
  placeholderKey: string;
  publicUrl: string;
  contentType: string;
  width: number | null;
  height: number | null;
  status: string;
}

/** Verifies the uploaded object content and transitions the asset to VERIFIED or UPLOAD_FAILED. */
export class ConfirmImageUploadUseCase {
  constructor(
    private readonly emailAssetRepo: IEmailAssetRepository,
    private readonly storageService: IEmailAssetStorageService,
    private readonly contentVerifier: IImageContentVerifier,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ConfirmImageUploadInput): Promise<ConfirmImageUploadOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'email_assets.confirm',
      entityType: 'EmailAsset',
    });

    const asset = await this.emailAssetRepo.findById(input.assetId);
    if (!asset) throw new NotFoundError('ASSET_NOT_FOUND', 'Email asset not found');

    const objectExists = await this.storageService.objectExists(asset.storageKey);
    if (!objectExists) {
      await this.emailAssetRepo.updateStatus(input.assetId, 'UPLOAD_FAILED');
      throw new UnprocessableEntityError('Object not found in storage — upload may have failed or expired');
    }

    let contentType = asset.contentType;
    let width: number | null = null;
    let height: number | null = null;

    try {
      const bytes = await this.storageService.getObjectBytes(asset.storageKey);
      const verified = await this.contentVerifier.verify(bytes);
      contentType = verified.contentType;
      width = verified.width;
      height = verified.height;

      const updated = await this.emailAssetRepo.updateStatus(input.assetId, 'VERIFIED', {
        contentType, sizeBytes: verified.sizeBytes, width, height,
      });

      this.auditService.log({
        action: 'EMAIL_ASSET_UPLOADED',
        actorType: 'USER',
        actorId: input.actor.userId,
        entityType: 'EMAIL_ASSET',
        entityId: input.assetId,
        tenantId: asset.tenantId ?? undefined,
        after: { status: 'VERIFIED', contentType, width, height },
      });

      return {
        id: updated.id, placeholderKey: updated.placeholderKey, publicUrl: updated.publicUrl,
        contentType: updated.contentType, width: updated.width, height: updated.height, status: updated.status,
      };
    } catch (err) {
      await this.emailAssetRepo.updateStatus(input.assetId, 'UPLOAD_FAILED');
      const message = err instanceof Error ? err.message : 'Content verification failed';
      throw new UnprocessableEntityError(message);
    }
  }
}
