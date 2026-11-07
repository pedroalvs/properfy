import type { Prisma } from '@prisma/client';
import type { FileCounts, PropertyFileType } from '@properfy/shared';
import type { PropertyFileEntity, NewPropertyFile, PurgeableFile } from './property-file.entity';

export interface PropertyFileListFilter {
  type?: PropertyFileType;
  /** When set, confine the listing to this tenant (CL/INSP scope); undefined = cross-tenant (AM/OP). */
  tenantId?: string;
}

export interface LinkPendingIssuePhotosParams {
  fileIds: string[];
  issueId: string;
  propertyId: string;
  appointmentId: string | null;
  tenantId: string;
  now: Date;
}

export interface IPropertyFileRepository {
  create(input: NewPropertyFile, tx?: Prisma.TransactionClient): Promise<PropertyFileEntity>;
  findById(id: string, tx?: Prisma.TransactionClient): Promise<PropertyFileEntity | null>;
  /** The tenant that owns a property (the file/issue tenant), or null if absent. */
  findPropertyTenantId(propertyId: string, tx?: Prisma.TransactionClient): Promise<string | null>;
  listReadyByProperty(
    propertyId: string,
    filter?: PropertyFileListFilter,
    tx?: Prisma.TransactionClient,
  ): Promise<PropertyFileEntity[]>;
  listReadyByAppointment(
    appointmentId: string,
    filter?: PropertyFileListFilter,
    tx?: Prisma.TransactionClient,
  ): Promise<PropertyFileEntity[]>;
  countsByProperty(propertyId: string, tenantId?: string): Promise<FileCounts>;
  countsByAppointment(appointmentId: string, tenantId?: string): Promise<FileCounts>;
  /** Highest `version` currently in a version group (0 when the group is empty). */
  maxVersion(versionGroupId: string, tx?: Prisma.TransactionClient): Promise<number>;
  /**
   * Record the verified `sizeBytes`; flip to READY only when `setReady` (false
   * keeps a new issue photo PENDING until its issue is created — D20).
   */
  confirmUpload(
    id: string,
    sizeBytes: number,
    setReady: boolean,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
  softDelete(
    id: string,
    deletedByUserId: string,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
  /** Non-deleted READY photos for a set of issues (issue-list enrichment). */
  listReadyPhotosByIssueIds(
    issueIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<PropertyFileEntity[]>;
  /**
   * Atomically attach the PENDING issue photos to a new issue (D20). Returns the
   * number of rows updated — the caller rolls back when it is not the full set.
   */
  linkPendingIssuePhotos(
    params: LinkPendingIssuePhotosParams,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;
  softDeletePhotosByIssueId(
    issueId: string,
    deletedByUserId: string,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;

  // ── Retention (daily job) ───────────────────────────────────────────────
  /** Soft-deleted READY files past the deleted-retention cut-off, not yet purged. */
  findDeletedToPurge(before: Date, limit: number): Promise<PurgeableFile[]>;
  /** Active READY files past the active-retention cut-off, not yet purged. */
  findActiveToPurge(before: Date, limit: number): Promise<PurgeableFile[]>;
  /** PENDING orphans older than the cut-off (24 h), not yet purged. */
  findPendingOrphansToPurge(before: Date, limit: number): Promise<PurgeableFile[]>;
  /** Mark a file purged; `softDelete` also sets `deleted_at` (orphan sweep). */
  markPurged(id: string, now: Date, options: { softDelete: boolean }): Promise<void>;
}

/**
 * Narrow reader so the appointment/property detail use cases can report
 * `fileCounts` without depending on the whole file repository.
 */
export interface IPropertyFileCountReader {
  countsByProperty(propertyId: string, tenantId?: string): Promise<FileCounts>;
  countsByAppointment(appointmentId: string, tenantId?: string): Promise<FileCounts>;
}
