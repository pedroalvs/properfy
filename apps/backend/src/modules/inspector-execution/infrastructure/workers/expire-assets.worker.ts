import type { IInspectionAssetRepository } from '../../domain/inspection-asset.repository';
import type { IStorageService } from '../../domain/storage.service';
import type { Logger } from '../../../../shared/infrastructure/logger';

const STORAGE_BUCKET = 'inspection-assets';

export class ExpireAssetsWorker {
  constructor(
    private readonly assetRepo: IInspectionAssetRepository,
    private readonly storageService: IStorageService,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<{ expiredCount: number }> {
    const now = new Date();
    const expired = await this.assetRepo.findExpiredPending(now);

    if (expired.length === 0) return { expiredCount: 0 };

    let expiredCount = 0;
    for (const asset of expired) {
      // Best-effort S3 cleanup — failure doesn't block DB update
      try {
        await this.storageService.deleteObject(STORAGE_BUCKET, asset.storageKey);
        this.logger.info({ assetId: asset.id, storageKey: asset.storageKey }, 'Deleted orphaned S3 object');
      } catch (err) {
        this.logger.warn({ assetId: asset.id, storageKey: asset.storageKey, err }, 'Failed to delete orphaned S3 object — will be cleaned up later');
      }

      await this.assetRepo.update(asset.id, { status: 'UPLOAD_FAILED' });
      expiredCount++;
    }

    this.logger.info({ expiredCount }, 'Expired pending asset uploads');
    return { expiredCount };
  }
}
