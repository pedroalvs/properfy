import type { PrismaClient } from '@prisma/client';
import { InspectionAssetEntity } from '../domain/inspection-asset.entity';
import type { IInspectionAssetRepository } from '../domain/inspection-asset.repository';

function mapToEntity(row: any): InspectionAssetEntity {
  return new InspectionAssetEntity({
    id: row.id,
    appointmentId: row.appointment_id,
    inspectionExecutionId: row.inspection_execution_id,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    kind: row.kind,
    status: row.status,
    uploadedBy: row.uploaded_by,
    uploadExpiresAt: row.upload_expires_at,
    createdAt: row.created_at,
  });
}

export class PrismaInspectionAssetRepository implements IInspectionAssetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<InspectionAssetEntity | null> {
    const row = await this.prisma.inspectionAsset.findUnique({
      where: { id },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByExecutionId(executionId: string): Promise<InspectionAssetEntity[]> {
    const rows = await this.prisma.inspectionAsset.findMany({
      where: { inspection_execution_id: executionId },
    });
    return rows.map(mapToEntity);
  }

  async findUploadedByExecutionId(executionId: string): Promise<InspectionAssetEntity[]> {
    const rows = await this.prisma.inspectionAsset.findMany({
      where: {
        inspection_execution_id: executionId,
        status: 'UPLOADED',
      },
    });
    return rows.map(mapToEntity);
  }

  async save(asset: InspectionAssetEntity): Promise<void> {
    await this.prisma.inspectionAsset.create({
      data: {
        id: asset.id,
        appointment_id: asset.appointmentId,
        inspection_execution_id: asset.inspectionExecutionId,
        storage_key: asset.storageKey,
        mime_type: asset.mimeType,
        size_bytes: asset.sizeBytes,
        kind: asset.kind,
        status: asset.status,
        uploaded_by: asset.uploadedBy,
        upload_expires_at: asset.uploadExpiresAt,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      status: 'PENDING' | 'UPLOADED' | 'UPLOAD_FAILED';
      sizeBytes: number | null;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.sizeBytes !== undefined) updateData.size_bytes = data.sizeBytes;
    await this.prisma.inspectionAsset.update({ where: { id }, data: updateData });
  }

  // Cross-tenant: background job processes all tenants to expire stale upload slots
  async expirePendingAssets(): Promise<number> {
    const result = await this.prisma.inspectionAsset.updateMany({
      where: {
        status: 'PENDING',
        upload_expires_at: { lt: new Date() },
      },
      data: { status: 'UPLOAD_FAILED' },
    });
    return result.count;
  }
}
