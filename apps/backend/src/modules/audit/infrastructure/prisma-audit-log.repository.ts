import type { PrismaClient } from '@prisma/client';
import { AuditActorType as PrismaAuditActorType } from '@prisma/client';
import { AuditLogEntity } from '../domain/audit-log.entity';
import type {
  IAuditLogRepository,
  AuditLogFilters,
  PaginationParams,
} from '../domain/audit-log.repository';

function mapToEntity(row: any): AuditLogEntity {
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
        before_json: entry.beforeJson as any,
        after_json: entry.afterJson as any,
        request_id: entry.requestId,
        ip_address: entry.ipAddress,
        metadata_json: entry.metadataJson as any,
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
        before_json: e.beforeJson as any,
        after_json: e.afterJson as any,
        request_id: e.requestId,
        ip_address: e.ipAddress,
        metadata_json: e.metadataJson as any,
      })),
    });
  }

  async findAll(
    filters: AuditLogFilters,
    pagination: PaginationParams,
  ): Promise<AuditLogEntity[]> {
    // When full-text search is active, use raw SQL
    if (filters.q) {
      return this.findAllWithFullText(filters, pagination);
    }
    const where = this.buildWhere(filters);
    const rows = await this.prisma.auditLog.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: { created_at: pagination.sortOrder },
    });
    return rows.map(mapToEntity);
  }

  async count(filters: AuditLogFilters): Promise<number> {
    // When full-text search is active, use raw SQL count
    if (filters.q) {
      return this.countWithFullText(filters);
    }
    const where = this.buildWhere(filters);
    return this.prisma.auditLog.count({ where });
  }

  private async findAllWithFullText(
    filters: AuditLogFilters,
    pagination: PaginationParams,
  ): Promise<AuditLogEntity[]> {
    const { conditions, params } = this.buildRawConditions(filters);
    const orderDir = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const offset = (pagination.page - 1) * pagination.pageSize;
    params.push(pagination.pageSize, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const sql = `
      SELECT * FROM "AuditLog"
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at ${orderDir}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;
    const rows: any[] = await this.prisma.$queryRawUnsafe(sql, ...params);
    return rows.map(mapToEntity);
  }

  private async countWithFullText(filters: AuditLogFilters): Promise<number> {
    const { conditions, params } = this.buildRawConditions(filters);
    const sql = `
      SELECT COUNT(*)::int AS count FROM "AuditLog"
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
