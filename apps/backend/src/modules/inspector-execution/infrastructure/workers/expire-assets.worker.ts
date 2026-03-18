import type { IInspectionAssetRepository } from '../../domain/inspection-asset.repository';
import type { Logger } from '../../../../shared/infrastructure/logger';

export class ExpireAssetsWorker {
  constructor(
    private readonly assetRepo: IInspectionAssetRepository,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<{ expiredCount: number }> {
    const expiredCount = await this.assetRepo.expirePendingAssets();
    if (expiredCount > 0) {
      this.logger.info({ expiredCount }, 'Expired pending asset uploads');
    }
    return { expiredCount };
  }
}
