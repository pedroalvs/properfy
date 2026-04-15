import type { PrismaClient, Prisma } from '@prisma/client';
import type {
  AuditActorType as PrismaAuditActorType,
  AuditRetentionCategory as PrismaAuditRetentionCategory,
  AuditRedactionStatus as PrismaAuditRedactionStatus,
} from '@prisma/client';
import type { AuditRetentionCategory, AuditRedactionStatus } from '@properfy/shared';
import { AuditLogEntity } from '../domain/audit-log.entity';
import type {
  IAuditLogRepository,
  AuditLogFilters,
  PaginationParams,
  FindAllOptions,
  SearchPiiOptions,
  PiiSearchMatch,
} from '../domain/audit-log.repository';

function mapToEntity(row: any, isArchived = false): AuditLogEntity {
  return new AuditLogEntity({
    id: row.id,
    tenantId: row.tenant_id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    reason: row.reason,
    beforeJson: row.before_json,
    afterJson: row.after_json,
    requestId: row.request_id,
    ipAddress: row.ip_address,
    metadataJson: row.metadata_json as Record<string, unknown> | null,
    createdAt: row.created_at,
    retentionCategory: row.retention_category ?? null,
    redactionStatus: row.redaction_status ?? 'NONE',
    coldStorage: row.cold_storage ?? isArchived,
    preservationRuleId: row.preservation_rule_id ?? null,
    isArchived,
  });
}

export class PrismaAuditLogRepository implements IAuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(entry: AuditLogEntity): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: entry.id,
        tenant_id: entry.tenantId,
        actor_type: entry.actorType as PrismaAuditActorType,
        actor_id: entry.actorId,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        action: entry.action,
        reason: entry.reason,
        before_json: entry.beforeJson as Prisma.InputJsonValue,
        after_json: entry.afterJson as Prisma.InputJsonValue,
        request_id: entry.requestId,
        ip_address: entry.ipAddress,
        metadata_json: entry.metadataJson as Prisma.InputJsonValue,
        retention_category: entry.retentionCategory as PrismaAuditRetentionCategory | null,
        redaction_status: entry.redactionStatus as PrismaAuditRedactionStatus,
      },
    });
  }

  async saveMany(entries: AuditLogEntity[]): Promise<void> {
    await this.prisma.auditLog.createMany({
      data: entries.map((e) => ({
        id: e.id,
        tenant_id: e.tenantId,
        actor_type: e.actorType as PrismaAuditActorType,
        actor_id: e.actorId,
        entity_type: e.entityType,
        entity_id: e.entityId,
        action: e.action,
        reason: e.reason,
        before_json: e.beforeJson as Prisma.InputJsonValue,
        after_json: e.afterJson as Prisma.InputJsonValue,
        request_id: e.requestId,
        ip_address: e.ipAddress,
        metadata_json: e.metadataJson as Prisma.InputJsonValue,
        retention_category: e.retentionCategory as PrismaAuditRetentionCategory | null,
        redaction_status: e.redactionStatus as PrismaAuditRedactionStatus,
      })),
    });
  }

  async findAll(
    filters: AuditLogFilters,
    pagination: PaginationParams,
    options: FindAllOptions = {},
  ): Promise<AuditLogEntity[]> {
    if (filters.q) {
      return this.findAllWithFullText(filters, pagination, options);
    }
    const hotRows = await this.findManyInTable('audit_logs', filters, pagination);
    if (!options.includeArchived) {
      return hotRows.map((r) => mapToEntity(r, false));
    }
    const archiveRows = await this.findManyInTable('audit_logs_archive', filters, pagination);
    const merged = [
      ...hotRows.map((r) => mapToEntity(r, false)),
      ...archiveRows.map((r) => mapToEntity(r, true)),
    ];
    merged.sort((a, b) => {
      const t = b.createdAt.getTime() - a.createdAt.getTime();
      return pagination.sortOrder === 'asc' ? -t : t;
    });
    return merged.slice(0, pagination.pageSize);
  }

  async count(
    filters: AuditLogFilters,
    options: FindAllOptions = {},
  ): Promise<number> {
    if (filters.q) {
      return this.countWithFullText(filters, options);
    }
    const hotCount = await this.countInTable('audit_logs', filters);
    if (!options.includeArchived) return hotCount;
    const archiveCount = await this.countInTable('audit_logs_archive', filters);
    return hotCount + archiveCount;
  }

  // ─── Feature 020 additions ─────────────────────────────────────────────

  async findById(id: string, options: { includeArchived?: boolean } = {}): Promise<AuditLogEntity | null> {
    const hot = await this.prisma.auditLog.findUnique({ where: { id } });
    if (hot) return mapToEntity(hot, false);
    if (!options.includeArchived) return null;
    const archive = await this.prisma.auditLogArchive.findUnique({ where: { id } });
    return archive ? mapToEntity(archive, true) : null;
  }

  async findByIds(
    ids: string[],
    options: { includeArchived?: boolean } = {},
  ): Promise<AuditLogEntity[]> {
    if (ids.length === 0) return [];
    const hotRows = await this.prisma.auditLog.findMany({ where: { id: { in: ids } } });
    const result = hotRows.map((r) => mapToEntity(r, false));
    if (!options.includeArchived) return result;
    const archiveRows = await this.prisma.auditLogArchive.findMany({ where: { id: { in: ids } } });
    return [...result, ...archiveRows.map((r) => mapToEntity(r, true))];
  }

  async updateRedactionStatus(ids: string[], status: AuditRedactionStatus): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.auditLog.updateMany({
      where: { id: { in: ids } },
      data: { redaction_status: status as PrismaAuditRedactionStatus },
    });
    await this.prisma.auditLogArchive.updateMany({
      where: { id: { in: ids } },
      data: { redaction_status: status as PrismaAuditRedactionStatus },
    });
  }

  async updateRedactedSnapshots(
    id: string,
    beforeJson: unknown | null,
    afterJson: unknown | null,
    metadataJson: Record<string, unknown> | null,
    finalStatus: AuditRedactionStatus,
  ): Promise<void> {
    // Try hot first; if no row, try archive. At most one succeeds.
    const hotResult = await this.prisma.auditLog.updateMany({
      where: { id },
      data: {
        before_json: beforeJson as Prisma.InputJsonValue,
        after_json: afterJson as Prisma.InputJsonValue,
        metadata_json: metadataJson as Prisma.InputJsonValue,
        redaction_status: finalStatus as PrismaAuditRedactionStatus,
      },
    });
    if (hotResult.count === 0) {
      await this.prisma.auditLogArchive.updateMany({
        where: { id },
        data: {
          before_json: beforeJson as Prisma.InputJsonValue,
          after_json: afterJson as Prisma.InputJsonValue,
          metadata_json: metadataJson as Prisma.InputJsonValue,
          redaction_status: finalStatus as PrismaAuditRedactionStatus,
        },
      });
    }
  }

  async moveToCold(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    // Single-transaction move to preserve atomicity (FR-004).
    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.auditLog.findMany({ where: { id: { in: ids } } });
      if (rows.length === 0) return 0;
      await tx.auditLogArchive.createMany({
        data: rows.map((r) => ({
          id: r.id,
          tenant_id: r.tenant_id,
          actor_type: r.actor_type,
          actor_id: r.actor_id,
          entity_type: r.entity_type,
          entity_id: r.entity_id,
          action: r.action,
          reason: r.reason,
          before_json: r.before_json as Prisma.InputJsonValue,
          after_json: r.after_json as Prisma.InputJsonValue,
          request_id: r.request_id,
          ip_address: r.ip_address,
          metadata_json: r.metadata_json as Prisma.InputJsonValue,
          created_at: r.created_at,
          retention_category: r.retention_category,
          redaction_status: r.redaction_status,
          cold_storage: true,
          preservation_rule_id: r.preservation_rule_id,
        })),
        skipDuplicates: true,
      });
      const deletion = await tx.auditLog.deleteMany({ where: { id: { in: ids } } });
      return deletion.count;
    });
    return result;
  }

  async hardDeleteFromArchive(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.prisma.auditLogArchive.deleteMany({
      where: { id: { in: ids } },
    });
    return result.count;
  }

  async findEligibleForRetention(
    category: AuditRetentionCategory,
    cutoffDate: Date,
    batchSize: number,
  ): Promise<AuditLogEntity[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        retention_category: category as PrismaAuditRetentionCategory,
        created_at: { lt: cutoffDate },
        redaction_status: { not: 'IN_PROGRESS' },
      },
      take: batchSize,
      orderBy: { created_at: 'asc' },
    });
    return rows.map((r) => mapToEntity(r, false));
  }

  async searchPiiByValues(
    values: string[],
    piiFieldPaths: string[],
    options: SearchPiiOptions,
  ): Promise<PiiSearchMatch[]> {
    if (values.length === 0 || piiFieldPaths.length === 0) return [];

    // Build an ILIKE across the raw JSON text representation of each snapshot
    // column. This is deliberately coarse: the scan is a superset filter and
    // the erasure use case refines field-level matches using the registry.
    const likePatterns = values.map((v) => `%${v}%`);
    const matchCondition = `(
      before_json::text ILIKE ANY($1::text[])
      OR after_json::text ILIKE ANY($1::text[])
      OR metadata_json::text ILIKE ANY($1::text[])
    )`;

    const hotRows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT id, entity_type, entity_id, action, tenant_id, retention_category, redaction_status
       FROM "audit_logs"
       WHERE ${matchCondition}
       LIMIT 5000`,
      likePatterns,
    );
    const hotMatches: PiiSearchMatch[] = hotRows.map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      action: r.action,
      tenantId: r.tenant_id,
      retentionCategory: r.retention_category ?? null,
      redactionStatus: r.redaction_status,
      isArchived: false,
    }));

    if (!options.includeArchived) return hotMatches;

    const archiveRows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT id, entity_type, entity_id, action, tenant_id, retention_category, redaction_status
       FROM "audit_logs_archive"
       WHERE ${matchCondition}
       LIMIT 5000`,
      likePatterns,
    );
    const archiveMatches: PiiSearchMatch[] = archiveRows.map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      action: r.action,
      tenantId: r.tenant_id,
      retentionCategory: r.retention_category ?? null,
      redactionStatus: r.redaction_status,
      isArchived: true,
    }));

    return [...hotMatches, ...archiveMatches];
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async findManyInTable(
    table: 'audit_logs' | 'audit_logs_archive',
    filters: AuditLogFilters,
    pagination: PaginationParams,
  ): Promise<any[]> {
    if (table === 'audit_logs') {
      const where = this.buildWhere(filters);
      return this.prisma.auditLog.findMany({
        where,
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
        orderBy: { created_at: pagination.sortOrder },
      });
    }
    const where = this.buildWhere(filters);
    return this.prisma.auditLogArchive.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: { created_at: pagination.sortOrder },
    });
  }

  private async countInTable(
    table: 'audit_logs' | 'audit_logs_archive',
    filters: AuditLogFilters,
  ): Promise<number> {
    const where = this.buildWhere(filters);
    if (table === 'audit_logs') {
      return this.prisma.auditLog.count({ where });
    }
    return this.prisma.auditLogArchive.count({ where });
  }

  private async findAllWithFullText(
    filters: AuditLogFilters,
    pagination: PaginationParams,
    options: FindAllOptions,
  ): Promise<AuditLogEntity[]> {
    // Existing full-text search path against hot only — archived FTS is out
    // of scope for MVP (operators looking for cold data use the id/entity
    // filters, not the free-text `q` parameter).
    const { conditions, params } = this.buildRawConditions(filters);
    const orderDir = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const offset = (pagination.page - 1) * pagination.pageSize;
    params.push(pagination.pageSize, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const sql = `
      SELECT * FROM "audit_logs"
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at ${orderDir}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;
    const rows: any[] = await this.prisma.$queryRawUnsafe(sql, ...params);
    const result = rows.map((r) => mapToEntity(r, false));
    if (!options.includeArchived) return result;
    // Archived full-text is not indexed; skip in MVP and return hot results only.
    return result;
  }

  private async countWithFullText(
    filters: AuditLogFilters,
    _options: FindAllOptions,
  ): Promise<number> {
    const { conditions, params } = this.buildRawConditions(filters);
    const sql = `
      SELECT COUNT(*)::int AS count FROM "audit_logs"
      WHERE ${conditions.join(' AND ')}
    `;
    const result: any[] = await this.prisma.$queryRawUnsafe(sql, ...params);
    return result[0]?.count ?? 0;
  }

  private buildRawConditions(filters: AuditLogFilters): { conditions: string[]; params: unknown[] } {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (filters.tenantId) {
      params.push(filters.tenantId);
      conditions.push(`tenant_id = $${params.length}`);
    }
    if (filters.entityType) {
      params.push(filters.entityType);
      conditions.push(`entity_type = $${params.length}`);
    }
    if (filters.entityId) {
      params.push(filters.entityId);
      conditions.push(`entity_id = $${params.length}`);
    }
    if (filters.actorId) {
      params.push(filters.actorId);
      conditions.push(`actor_id = $${params.length}`);
    }
    if (filters.action) {
      params.push(filters.action);
      conditions.push(`action = $${params.length}`);
    }
    if (filters.fromDate) {
      params.push(new Date(filters.fromDate));
      conditions.push(`created_at >= $${params.length}`);
    }
    if (filters.toDate) {
      params.push(new Date(filters.toDate));
      conditions.push(`created_at <= $${params.length}`);
    }
    if (filters.q) {
      params.push(filters.q);
      conditions.push(
        `to_tsvector('english', coalesce(reason, '') || ' ' || coalesce(metadata_json::text, '')) @@ plainto_tsquery('english', $${params.length})`,
      );
    }

    return { conditions, params };
  }

  private buildWhere(filters: AuditLogFilters) {
    const where: Record<string, unknown> = {};
    if (filters.tenantId) where['tenant_id'] = filters.tenantId;
    if (filters.entityType) where['entity_type'] = filters.entityType;
    if (filters.entityId) where['entity_id'] = filters.entityId;
    if (filters.actorId) where['actor_id'] = filters.actorId;
    if (filters.action) where['action'] = filters.action;
    if (filters.fromDate || filters.toDate) {
      const dateFilter: Record<string, unknown> = {};
      if (filters.fromDate) dateFilter['gte'] = new Date(filters.fromDate);
      if (filters.toDate) dateFilter['lte'] = new Date(filters.toDate);
      where['created_at'] = dateFilter;
    }
    return where;
  }
}
