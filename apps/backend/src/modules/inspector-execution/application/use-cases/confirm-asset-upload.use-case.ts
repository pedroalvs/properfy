import type { AuthContext } from '@properfy/shared';
import type { IInspectionAssetRepository } from '../../domain/inspection-asset.repository';
import type { IStorageService } from '../../domain/storage.service';
import { ForbiddenError } from '../../../../shared/domain/errors';
import {
  AssetNotFoundError,
  AssetUploadExpiredError,
  AssetUploadNotFoundInStorageError,
} from '../../domain/inspection-execution.errors';

const STORAGE_BUCKET = 'inspection-assets';

export interface ConfirmAssetUploadInput {
  appointmentId: string;
  assetId: string;
  actor: AuthContext;
}

export interface ConfirmAssetUploadOutput {
  assetId: string;
  status: 'UPLOADED' | 'UPLOAD_FAILED';
  sizeBytes: number | null;
}

export class ConfirmAssetUploadUseCase {
  constructor(
    private readonly assetRepo: IInspectionAssetRepository,
    private readonly storageService: IStorageService,
  ) {}

  async execute(input: ConfirmAssetUploadInput): Promise<ConfirmAssetUploadOutput> {
    const { appointmentId, assetId, actor } = input;

    // 1. INSP only
    if (actor.role !== 'INSP') {
      throw new ForbiddenError('FORBIDDEN', 'Only inspectors can confirm asset uploads');
    }

    if (!actor.inspectorId) {
      throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
    }

    // 2. Load asset
    const asset = await this.assetRepo.findById(assetId);
    if (!asset || asset.uploadedBy !== actor.userId) {
      throw new AssetNotFoundError();
    }

    if (asset.appointmentId !== appointmentId) {
      throw new AssetNotFoundError();
    }

    // 3. Idempotent: already uploaded
    if (asset.isUploaded()) {
      return {
        assetId: asset.id,
        status: 'UPLOADED',
        sizeBytes: asset.sizeBytes,
      };
    }

    // 4. Check expiry
    const now = new Date();
    if (asset.isExpired(now)) {
      throw new AssetUploadExpiredError();
    }

    // 5. HEAD check in storage
    const headResult = await this.storageService.headObject(STORAGE_BUCKET, asset.storageKey);

    if (headResult.exists) {
      // 6a. Mark as UPLOADED
      await this.assetRepo.update(assetId, {
        status: 'UPLOADED',
        sizeBytes: headResult.sizeBytes,
      });

      return {
        assetId: asset.id,
        status: 'UPLOADED',
        sizeBytes: headResult.sizeBytes,
      };
    } else {
      // 6b. Mark as UPLOAD_FAILED
      await this.assetRepo.update(assetId, {
        status: 'UPLOAD_FAILED',
        sizeBytes: null,
      });

      throw new AssetUploadNotFoundInStorageError();
    }
  }
}
