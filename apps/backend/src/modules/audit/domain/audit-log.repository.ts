import type { AuditRedactionStatus, AuditRetentionCategory } from '@properfy/shared';
import type { AuditLogEntity } from './audit-log.entity';

export interface AuditLogFilters {
  tenantId?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  fromDate?: string;
  toDate?: string;
  q?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface FindAllOptions {
  /** Feature 020: when true, merges hot (`audit_logs`) and cold (`audit_logs_archive`) tiers. */
  includeArchived?: boolean;
}

export interface SearchPiiOptions {
  includeArchived: boolean;
}

export interface PiiSearchMatch {
  id: string;
  entityType: string;
  entityId: string | null;
  action: string;
  tenantId: string | null;
  retentionCategory: AuditRetentionCategory | null;
  redactionStatus: AuditRedactionStatus;
  isArchived: boolean;
}

export interface IAuditLogRepository {
  save(entry: AuditLogEntity): Promise<void>;
  saveMany(entries: AuditLogEntity[]): Promise<void>;
  findAll(
    filters: AuditLogFilters,
    pagination: PaginationParams,
    options?: FindAllOptions,
  ): Promise<AuditLogEntity[]>;
  count(filters: AuditLogFilters, options?: FindAllOptions): Promise<number>;

  // ─── Feature 020 additions ─────────────────────────────────────────────

  /** Fetch a single entry from hot or archive by id. */
  findById(id: string, options?: { includeArchived?: boolean }): Promise<AuditLogEntity | null>;
  /** Batch fetch across hot + archive by id list. */
  findByIds(ids: string[], options?: { includeArchived?: boolean }): Promise<AuditLogEntity[]>;
  /** Atomically flip `redaction_status` on a set of rows. Used as the concurrency guard. */
  updateRedactionStatus(ids: string[], status: AuditRedactionStatus): Promise<void>;
  /** Update the redacted JSON snapshots in place (hot or archive). */
  updateRedactedSnapshots(
    id: string,
    beforeJson: unknown | null,
    afterJson: unknown | null,
    metadataJson: Record<string, unknown> | null,
    finalStatus: AuditRedactionStatus,
  ): Promise<void>;
  /** Move entries from hot to archive in a single transaction (INSERT ... SELECT + DELETE). */
  moveToCold(ids: string[]): Promise<number>;
  /** Hard delete from archive (FR-005). Used only by the explicit hard-delete sweep. */
  hardDeleteFromArchive(ids: string[]): Promise<number>;
  /** Count rows eligible for retention processing (past cutoff, not preserved, not IN_PROGRESS). */
  findEligibleForRetention(
    category: AuditRetentionCategory,
    cutoffDate: Date,
    batchSize: number,
  ): Promise<AuditLogEntity[]>;
  /**
   * Search for PII values across registered field paths. Used by the erasure
   * preview scan. Returns id-only records for efficiency; callers fetch full
   * entities via `findByIds` when they need the JSON snapshots.
   */
  searchPiiByValues(
    values: string[],
    piiFieldPaths: string[],
    options: SearchPiiOptions,
  ): Promise<PiiSearchMatch[]>;
}
