import type { AuthContext } from '@properfy/shared';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IInspectionAssetRepository } from '../../domain/inspection-asset.repository';
import type { IStorageService } from '../../domain/storage.service';

const STORAGE_BUCKET = 'inspection-assets';
const DOWNLOAD_TTL_SECONDS = 300; // 5 minutes

export interface GetAppointmentAssetDownloadUrlOutput {
  downloadUrl: string;
  fileName: string | null;
  mimeType: string;
}

export class GetAppointmentAssetDownloadUrlUseCase {
  constructor(
    private readonly assetRepo: IInspectionAssetRepository,
    private readonly storageService: IStorageService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(
    appointmentId: string,
    assetId: string,
    actor: AuthContext,
  ): Promise<GetAppointmentAssetDownloadUrlOutput> {
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'appointment.download_evidence',
      entityType: 'InspectionAsset',
    });

    const asset = await this.assetRepo.findById(assetId);
    if (!asset || asset.appointmentId !== appointmentId || !asset.isUploaded()) {
      throw new NotFoundError('ASSET_NOT_FOUND', 'Asset not found or not yet uploaded');
    }

    const downloadUrl = await this.storageService.createSignedDownloadUrl(
      STORAGE_BUCKET,
      asset.storageKey,
      DOWNLOAD_TTL_SECONDS,
    );

    return {
      downloadUrl,
      fileName: asset.originalFilename,
      mimeType: asset.mimeType,
    };
  }
}
