import { randomUUID } from 'crypto';
import type { AuthContext } from '@properfy/shared';
import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import type { IInspectionAssetRepository } from '../../domain/inspection-asset.repository';
import type { IStorageService } from '../../domain/storage.service';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import { InspectionAssetEntity } from '../../domain/inspection-asset.entity';
import { isAllowedMimeType } from '../../domain/allowed-mime-types';
import { ForbiddenError } from '../../../../shared/domain/errors';
import {
  ExecutionNotStartedError,
  ExecutionAlreadyFinishedError,
  AssetMimeTypeNotAllowedError,
} from '../../domain/inspection-execution.errors';

const UPLOAD_TTL_SECONDS = 900; // 15 minutes
const STORAGE_BUCKET = 'inspection-assets';

export interface RequestAssetUploadInput {
  appointmentId: string;
  kind: 'PHOTO' | 'DOCUMENT' | 'SIGNATURE';
  mimeType: string;
  fileName: string;
  actor: AuthContext;
}

export interface RequestAssetUploadOutput {
  assetId: string;
  uploadUrl: string;
  storageKey: string;
  expiresAt: string;
}

export class RequestAssetUploadUseCase {
  constructor(
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly assetRepo: IInspectionAssetRepository,
    private readonly storageService: IStorageService,
    private readonly appointmentRepo: IAppointmentRepository,
  ) {}

  async execute(input: RequestAssetUploadInput): Promise<RequestAssetUploadOutput> {
    const { appointmentId, kind, mimeType, fileName, actor } = input;

    // 1. INSP only
    if (actor.role !== 'INSP') {
      throw new ForbiddenError('FORBIDDEN', 'Only inspectors can upload assets');
    }

    // 2. Load execution
    const execution = await this.executionRepo.findByAppointmentId(appointmentId);
    if (!execution) throw new ExecutionNotStartedError();

    // 3. Check not finished
    if (execution.isFinished()) throw new ExecutionAlreadyFinishedError();

    // 4. Validate MIME type
    if (!isAllowedMimeType(kind, mimeType)) {
      throw new AssetMimeTypeNotAllowedError();
    }

    // 5. Generate storage key
    // Load appointment to get tenantId for storage path
    const appointmentResult = await this.appointmentRepo.findById(appointmentId, null);
    const tenantId = appointmentResult?.appointment.tenantId ?? 'unknown';

    const assetId = randomUUID();
    const ext = this.getExtension(mimeType, fileName);
    const storageKey = `inspections/${tenantId}/${appointmentId}/${assetId}.${ext}`;

    // 6. Get presigned URL
    const { url } = await this.storageService.createSignedUploadUrl(
      STORAGE_BUCKET,
      storageKey,
      UPLOAD_TTL_SECONDS,
    );

    // 7. Create PENDING asset record
    const now = new Date();
    const expiresAt = new Date(now.getTime() + UPLOAD_TTL_SECONDS * 1000);

    const asset = new InspectionAssetEntity({
      id: assetId,
      appointmentId,
      inspectionExecutionId: execution.id,
      storageKey,
      mimeType,
      sizeBytes: null,
      kind,
      status: 'PENDING',
      uploadedBy: actor.userId,
      uploadExpiresAt: expiresAt,
      createdAt: now,
    });

    await this.assetRepo.save(asset);

    return {
      assetId,
      uploadUrl: url,
      storageKey,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private getExtension(mimeType: string, fileName: string): string {
    // Try to extract from fileName first
    const fileExt = fileName.split('.').pop();
    if (fileExt && fileExt !== fileName) return fileExt;

    // Fallback to MIME type mapping
    const mimeMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/heic': 'heic',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'application/pdf': 'pdf',
    };
    return mimeMap[mimeType] ?? 'bin';
  }
}
