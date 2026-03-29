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

interface UserReader {
  findById(id: string): Promise<{ id: string; name: string } | null>;
}

export interface AuditLogOutput {
  id: string;
  tenantId: string | null;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
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
  constructor(
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly userReader?: UserReader,
  ) {}

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

    // Batch-fetch user names for actor resolution
    const userActorIds = [
      ...new Set(
        data
          .filter((e) => e.actorType === 'USER' && e.actorId)
          .map((e) => e.actorId!),
      ),
    ];
    const userMap = new Map<string, string>();
    if (this.userReader && userActorIds.length > 0) {
      await Promise.all(
        userActorIds.map(async (uid) => {
          const user = await this.userReader!.findById(uid);
          if (user) userMap.set(uid, user.name);
        }),
      );
    }

    return {
      data: data.map((entry) => ({
        id: entry.id,
        tenantId: entry.tenantId,
        actorType: entry.actorType,
        actorId: entry.actorId,
        actorName:
          entry.actorType === 'USER'
            ? userMap.get(entry.actorId!) ?? null
            : entry.actorType === 'SYSTEM'
              ? 'System'
              : null,
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
