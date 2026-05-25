import type { InspectionAssetEntity } from './inspection-asset.entity';

export interface IInspectionAssetRepository {
  findById(id: string): Promise<InspectionAssetEntity | null>;
  findByExecutionId(executionId: string): Promise<InspectionAssetEntity[]>;
  findUploadedByExecutionId(executionId: string): Promise<InspectionAssetEntity[]>;
  findUploadedByAppointmentId(appointmentId: string): Promise<InspectionAssetEntity[]>;
  save(asset: InspectionAssetEntity): Promise<void>;
  update(
    id: string,
    data: Partial<{
      status: 'PENDING' | 'UPLOADED' | 'UPLOAD_FAILED';
      sizeBytes: number | null;
    }>,
  ): Promise<void>;
  expirePendingAssets(): Promise<number>;
  findExpiredPending(now: Date): Promise<InspectionAssetEntity[]>;
}
