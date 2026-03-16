import type { Logger } from './logger';

export interface AuditLogEntry {
  action: string;
  actorType: 'USER' | 'SYSTEM' | 'ANONYMOUS';
  actorId?: string;
  entityType: string;
  entityId?: string;
  tenantId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  requestId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  constructor(private readonly logger: Logger) {}

  log(entry: AuditLogEntry): void {
    this.logger.info(
      {
        audit: true,
        action: entry.action,
        actorType: entry.actorType,
        actorId: entry.actorId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        tenantId: entry.tenantId,
        requestId: entry.requestId,
        ipAddress: entry.ipAddress,
        before: entry.before,
        after: entry.after,
        reason: entry.reason,
        metadata: entry.metadata,
      },
      `AUDIT: ${entry.action}`,
    );
  }
}
