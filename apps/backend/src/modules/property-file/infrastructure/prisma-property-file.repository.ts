import { type PrismaClient, type Prisma } from '@prisma/client';
import type { FileCounts, PropertyFileType } from '@properfy/shared';
import type {
  IPropertyFileRepository,
  LinkPendingIssuePhotosParams,
  PropertyFileListFilter,
} from '../domain/property-file.repository';
import type {
  PropertyFileEntity,
  NewPropertyFile,
  PurgeableFile,
} from '../domain/property-file.entity';

type DbClient = PrismaClient | Prisma.TransactionClient;

// Prisma row (snake_case fields, per schema declaration).
interface PropertyFileRow {
  id: string;
  tenant_id: string;
  property_id: string;
  appointment_id: string | null;
  issue_id: string | null;
  type: string;
  version_group_id: string;
  version: number;
  file_name: string;
  mime: string;
  size_bytes: bigint;
  storage_key: string;
  status: string;
  confirmed_at: Date | null;
  uploaded_by_user_id: string | null;
  deleted_at: Date | null;
  deleted_by_user_id: string | null;
  purged_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toEntity(row: PropertyFileRow): PropertyFileEntity {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    propertyId: row.property_id,
    appointmentId: row.appointment_id,
    issueId: row.issue_id,
    type: row.type as PropertyFileType,
    versionGroupId: row.version_group_id,
    version: row.version,
    fileName: row.file_name,
    mime: row.mime,
    sizeBytes: Number(row.size_bytes),
    storageKey: row.storage_key,
    status: row.status as PropertyFileEntity['status'],
    confirmedAt: row.confirmed_at,
    uploadedByUserId: row.uploaded_by_user_id,
    deletedAt: row.deleted_at,
    deletedByUserId: row.deleted_by_user_id,
    purgedAt: row.purged_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const EMPTY_COUNTS: FileCounts = { total: 0, issues: 0, documents: 0, reports: 0, other: 0 };

export class PrismaPropertyFileRepository implements IPropertyFileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private db(tx?: Prisma.TransactionClient): DbClient {
    return tx ?? this.prisma;
  }

  async create(input: NewPropertyFile, tx?: Prisma.TransactionClient): Promise<PropertyFileEntity> {
    const row = (await this.db(tx).propertyFile.create({
      data: {
        id: input.id,
        tenant_id: input.tenantId,
        property_id: input.propertyId,
        appointment_id: input.appointmentId,
        issue_id: input.issueId,
        type: input.type,
        version_group_id: input.versionGroupId,
        version: input.version,
        file_name: input.fileName,
        mime: input.mime,
        size_bytes: BigInt(input.sizeBytes),
        storage_key: input.storageKey,
        status: input.status,
        uploaded_by_user_id: input.uploadedByUserId,
        created_at: input.createdAt,
      },
    })) as PropertyFileRow;
    return toEntity(row);
  }

  async findById(id: string, tx?: Prisma.TransactionClient): Promise<PropertyFileEntity | null> {
    const row = (await this.db(tx).propertyFile.findUnique({ where: { id } })) as PropertyFileRow | null;
    return row ? toEntity(row) : null;
  }

  async findPropertyTenantId(
    propertyId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string | null> {
    const row = await this.db(tx).property.findUnique({
      where: { id: propertyId },
      select: { tenant_id: true },
    });
    return row?.tenant_id ?? null;
  }

  async listReadyByProperty(
    propertyId: string,
    filter?: PropertyFileListFilter,
    tx?: Prisma.TransactionClient,
  ): Promise<PropertyFileEntity[]> {
    const rows = (await this.db(tx).propertyFile.findMany({
      where: {
        property_id: propertyId,
        status: 'READY',
        deleted_at: null,
        purged_at: null,
        ...(filter?.type ? { type: filter.type } : {}),
        ...(filter?.tenantId ? { tenant_id: filter.tenantId } : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    })) as PropertyFileRow[];
    return rows.map(toEntity);
  }

  async listReadyByAppointment(
    appointmentId: string,
    filter?: PropertyFileListFilter,
    tx?: Prisma.TransactionClient,
  ): Promise<PropertyFileEntity[]> {
    const rows = (await this.db(tx).propertyFile.findMany({
      where: {
        appointment_id: appointmentId,
        status: 'READY',
        deleted_at: null,
        purged_at: null,
        ...(filter?.type ? { type: filter.type } : {}),
        ...(filter?.tenantId ? { tenant_id: filter.tenantId } : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    })) as PropertyFileRow[];
    return rows.map(toEntity);
  }

  private async counts(where: Prisma.PropertyFileWhereInput): Promise<FileCounts> {
    const grouped = await this.prisma.propertyFile.groupBy({
      by: ['type'],
      where: { ...where, status: 'READY', deleted_at: null, purged_at: null },
      _count: { _all: true },
    });
    const counts: FileCounts = { ...EMPTY_COUNTS };
    for (const g of grouped) {
      const n = g._count._all;
      counts.total += n;
      if (g.type === 'ISSUE') counts.issues += n;
      else if (g.type === 'DOCUMENT') counts.documents += n;
      else if (g.type === 'REPORT') counts.reports += n;
      else if (g.type === 'OTHER') counts.other += n;
    }
    return counts;
  }

  countsByProperty(propertyId: string, tenantId?: string): Promise<FileCounts> {
    return this.counts({ property_id: propertyId, ...(tenantId ? { tenant_id: tenantId } : {}) });
  }

  countsByAppointment(appointmentId: string, tenantId?: string): Promise<FileCounts> {
    return this.counts({ appointment_id: appointmentId, ...(tenantId ? { tenant_id: tenantId } : {}) });
  }

  async maxVersion(versionGroupId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const result = await this.db(tx).propertyFile.aggregate({
      where: { version_group_id: versionGroupId },
      _max: { version: true },
    });
    return result._max.version ?? 0;
  }

  async confirmUpload(
    id: string,
    sizeBytes: number,
    setReady: boolean,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.db(tx).propertyFile.update({
      where: { id },
      data: {
        size_bytes: BigInt(sizeBytes),
        confirmed_at: now,
        updated_at: now,
        ...(setReady ? { status: 'READY' } : {}),
      },
    });
  }

  async softDelete(
    id: string,
    deletedByUserId: string,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.db(tx).propertyFile.update({
      where: { id },
      data: { deleted_at: now, deleted_by_user_id: deletedByUserId, updated_at: now },
    });
  }

  async listReadyPhotosByIssueIds(
    issueIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<PropertyFileEntity[]> {
    if (issueIds.length === 0) return [];
    const rows = (await this.db(tx).propertyFile.findMany({
      where: { issue_id: { in: issueIds }, status: 'READY', deleted_at: null, purged_at: null },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    })) as PropertyFileRow[];
    return rows.map(toEntity);
  }

  async linkPendingIssuePhotos(
    params: LinkPendingIssuePhotosParams,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    if (params.fileIds.length === 0) return 0;
    const result = await this.db(tx).propertyFile.updateMany({
      where: {
        id: { in: params.fileIds },
        status: 'PENDING',
        type: 'ISSUE',
        issue_id: null,
        tenant_id: params.tenantId,
        property_id: params.propertyId,
        // Only validated (confirmed) photos may be linked (C.A5); and never a
        // soft-deleted or purged row.
        confirmed_at: { not: null },
        deleted_at: null,
        purged_at: null,
      },
      data: {
        issue_id: params.issueId,
        appointment_id: params.appointmentId,
        status: 'READY',
        updated_at: params.now,
      },
    });
    return result.count;
  }

  async softDeletePhotosByIssueId(
    issueId: string,
    deletedByUserId: string,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.db(tx).propertyFile.updateMany({
      where: { issue_id: issueId, deleted_at: null },
      data: { deleted_at: now, deleted_by_user_id: deletedByUserId, updated_at: now },
    });
  }

  private async purgeable(where: Prisma.PropertyFileWhereInput, limit: number): Promise<PurgeableFile[]> {
    const rows = await this.prisma.propertyFile.findMany({
      where,
      select: { id: true, storage_key: true },
      take: limit,
      orderBy: { created_at: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, storageKey: r.storage_key }));
  }

  findDeletedToPurge(before: Date, limit: number): Promise<PurgeableFile[]> {
    return this.purgeable(
      { status: 'READY', deleted_at: { not: null, lt: before }, purged_at: null },
      limit,
    );
  }

  findActiveToPurge(before: Date, limit: number): Promise<PurgeableFile[]> {
    return this.purgeable(
      { status: 'READY', deleted_at: null, purged_at: null, created_at: { lt: before } },
      limit,
    );
  }

  findPendingOrphansToPurge(before: Date, limit: number): Promise<PurgeableFile[]> {
    return this.purgeable(
      { status: 'PENDING', purged_at: null, created_at: { lt: before } },
      limit,
    );
  }

  async markPurged(id: string, now: Date, options: { softDelete: boolean }): Promise<void> {
    await this.prisma.propertyFile.update({
      where: { id },
      data: {
        purged_at: now,
        updated_at: now,
        ...(options.softDelete ? { deleted_at: now } : {}),
      },
    });
  }
}
