import type { PrismaClient } from '@prisma/client';
import type { EmailAssetStatus } from '@properfy/shared';
import type { IEmailAssetRepository, EmailAssetData, CreateEmailAssetData } from '../domain/email-asset.repository';

function toData(row: {
  id: string; tenant_id: string | null; placeholder_key: string; storage_key: string;
  public_url: string; original_filename: string; content_type: string; size_bytes: number;
  width: number | null; height: number | null; status: string; ever_sent: boolean;
  uploaded_by_user_id: string; created_at: Date;
}): EmailAssetData {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    placeholderKey: row.placeholder_key,
    storageKey: row.storage_key,
    publicUrl: row.public_url,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    status: row.status as EmailAssetStatus,
    everSent: row.ever_sent,
    uploadedByUserId: row.uploaded_by_user_id,
    createdAt: row.created_at,
  };
}

export class PrismaEmailAssetRepository implements IEmailAssetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateEmailAssetData): Promise<EmailAssetData> {
    const row = await this.prisma.emailAsset.create({
      data: {
        id: data.id,
        tenant_id: data.tenantId,
        placeholder_key: data.placeholderKey,
        storage_key: data.storageKey,
        public_url: data.publicUrl,
        original_filename: data.originalFilename,
        content_type: data.contentType,
        size_bytes: data.sizeBytes,
        uploaded_by_user_id: data.uploadedByUserId,
      },
    });
    return toData(row as Parameters<typeof toData>[0]);
  }

  async findById(id: string): Promise<EmailAssetData | null> {
    const row = await this.prisma.emailAsset.findUnique({ where: { id } });
    return row ? toData(row as Parameters<typeof toData>[0]) : null;
  }

  async findByPlaceholderKey(tenantId: string | null, placeholderKey: string): Promise<EmailAssetData | null> {
    const row = await this.prisma.emailAsset.findFirst({
      where: { tenant_id: tenantId, placeholder_key: placeholderKey },
    });
    return row ? toData(row as Parameters<typeof toData>[0]) : null;
  }

  async findAll(tenantId: string | null): Promise<EmailAssetData[]> {
    const rows = await this.prisma.emailAsset.findMany({
      where: { tenant_id: tenantId, status: 'VERIFIED' },
      orderBy: { created_at: 'asc' },
    });
    return rows.map((r) => toData(r as Parameters<typeof toData>[0]));
  }

  async updateStatus(
    id: string,
    status: EmailAssetStatus,
    verifiedData?: { contentType: string; sizeBytes: number; width: number | null; height: number | null },
  ): Promise<EmailAssetData> {
    const row = await this.prisma.emailAsset.update({
      where: { id },
      data: {
        status,
        ...(verifiedData
          ? {
              content_type: verifiedData.contentType,
              size_bytes: verifiedData.sizeBytes,
              width: verifiedData.width,
              height: verifiedData.height,
            }
          : {}),
      },
    });
    return toData(row as Parameters<typeof toData>[0]);
  }

  async markEverSent(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.emailAsset.updateMany({ where: { id: { in: ids } }, data: { ever_sent: true } });
  }

  async hardDelete(id: string): Promise<void> {
    await this.prisma.emailAsset.delete({ where: { id } });
  }
}
