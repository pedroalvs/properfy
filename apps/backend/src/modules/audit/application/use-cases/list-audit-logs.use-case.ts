import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IAuditLogRepository, AuditLogFilters, PaginationParams } from '../../domain/audit-log.repository';

export interface ListAuditLogsInput {
  filters: {
    entityType?: string;
    entityId?: string;
    actorId?: string;
    action?: string;
    fromDate?: string;
    toDate?: string;
  };
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface AuditLogOutput {
  id: string;
  tenantId: string | null;
  actorType: string;
  actorId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  reason: string | null;
  beforeJson: unknown | null;
  afterJson: unknown | null;
  requestId: string | null;
  ipAddress: string | null;
  metadataJson: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ListAuditLogsOutput {
  data: AuditLogOutput[];
  total: number;
}

export class ListAuditLogsUseCase {
  constructor(private readonly auditLogRepo: IAuditLogRepository) {}

  async execute(input: ListAuditLogsInput): Promise<ListAuditLogsOutput> {
    const { actor, filters, pagination } = input;

    // Only AM and OP can view audit logs
    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to view audit logs');
    }

    const repoFilters: AuditLogFilters = {
      ...filters,
    };

    // OP sees only their tenant's audit logs
    if (actor.role === 'OP' && actor.tenantId) {
      repoFilters.tenantId = actor.tenantId;
    }

    const [data, total] = await Promise.all([
      this.auditLogRepo.findAll(repoFilters, pagination),
      this.auditLogRepo.count(repoFilters),
    ]);

    return {
      data: data.map((entry) => ({
        id: entry.id,
        tenantId: entry.tenantId,
        actorType: entry.actorType,
        actorId: entry.actorId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        reason: entry.reason,
        beforeJson: entry.beforeJson,
        afterJson: entry.afterJson,
        requestId: entry.requestId,
        ipAddress: entry.ipAddress,
        metadataJson: entry.metadataJson,
        createdAt: entry.createdAt,
      })),
      total,
    };
  }
}
